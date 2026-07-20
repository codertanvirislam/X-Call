import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { ALLOWED_KYC_MIME, MAX_KYC_BYTES, uploadKycFile } from "@/lib/s3";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  try {
    const { user } = await requireUser();
    const kyc = await prisma.kycSubmission.findUnique({ where: { userId: user.id } });
    return jsonOk({ kyc: kyc ?? { status: "NOT_STARTED" } });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireUser();

    const existing = await prisma.kycSubmission.findUnique({
      where: { userId: user.id },
    });
    if (existing?.status === "APPROVED") {
      return jsonError("KYC already approved");
    }
    if (existing?.status === "PENDING") {
      return jsonError("KYC is already pending review");
    }

    const form = await req.formData();
    const fullName = String(form.get("fullName") || "").trim();
    const nidNumber = String(form.get("nidNumber") || "").trim();
    const front = form.get("front");
    const back = form.get("back");

    if (!fullName || fullName.length < 2) return jsonError("Full name is required");
    if (!/^\d{10,17}$/.test(nidNumber)) {
      return jsonError("Enter a valid NID number (digits only)");
    }
    if (!(front instanceof File) || !(back instanceof File)) {
      return jsonError("NID front and back files are required");
    }

    if (!ALLOWED_KYC_MIME.has(front.type) || !ALLOWED_KYC_MIME.has(back.type)) {
      return jsonError("Only JPG, PNG, WEBP, or PDF allowed");
    }
    if (front.size > MAX_KYC_BYTES || back.size > MAX_KYC_BYTES) {
      return jsonError("Each file must be 5MB or less");
    }

    const frontBuf = Buffer.from(await front.arrayBuffer());
    const backBuf = Buffer.from(await back.arrayBuffer());

    const frontFileKey = await uploadKycFile({
      userId: user.id,
      side: "front",
      mimeType: front.type,
      body: frontBuf,
    });
    const backFileKey = await uploadKycFile({
      userId: user.id,
      side: "back",
      mimeType: back.type,
      body: backBuf,
    });

    const kyc = await prisma.kycSubmission.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName,
        nidNumber,
        frontFileKey,
        backFileKey,
        frontMimeType: front.type,
        backMimeType: back.type,
        status: "PENDING",
        rejectReason: null,
        reviewedAt: null,
        reviewedById: null,
      },
      update: {
        fullName,
        nidNumber,
        frontFileKey,
        backFileKey,
        frontMimeType: front.type,
        backMimeType: back.type,
        status: "PENDING",
        rejectReason: null,
        reviewedAt: null,
        reviewedById: null,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { name: fullName },
    });

    await writeAudit({
      actorId: user.id,
      action: "KYC_SUBMITTED",
      entityType: "KycSubmission",
      entityId: kyc.id,
    });

    return jsonOk({ ok: true, kyc: { id: kyc.id, status: kyc.status } });
  } catch (err) {
    return handleRouteError(err);
  }
}

