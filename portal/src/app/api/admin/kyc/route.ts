import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { getKycSignedUrl } from "@/lib/s3";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "PENDING";

    const items = await prisma.kycSubmission.findMany({
      where: status === "ALL" ? undefined : { status: status as "PENDING" | "APPROVED" | "REJECTED" },
      orderBy: { createdAt: "desc" },
      include: {
        store: {
          select: { id: true, phone: true, name: true, createdAt: true },
        },
      },
      take: 100,
    });

    const withUrls = await Promise.all(
      items.map(async (item) => {
        let frontUrl: string | null = null;
        let backUrl: string | null = null;
        try {
          frontUrl = await getKycSignedUrl(item.frontFileKey);
          backUrl = await getKycSignedUrl(item.backFileKey);
        } catch {
          // S3 may not be configured in local dev
        }
        return { ...item, frontUrl, backUrl };
      }),
    );

    return jsonOk({ items: withUrls });
  } catch (err) {
    return handleRouteError(err);
  }
}

const reviewSchema = z.object({
  kycId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    const body = reviewSchema.parse(await req.json());

    const kyc = await prisma.kycSubmission.findUnique({
      where: { id: body.kycId },
    });
    if (!kyc) return jsonError("KYC not found", 404);
    if (kyc.status !== "PENDING") return jsonError("KYC is not pending");

    if (body.action === "REJECT" && !body.rejectReason?.trim()) {
      return jsonError("Reject reason is required");
    }

    const updated = await prisma.kycSubmission.update({
      where: { id: kyc.id },
      data: {
        status: body.action === "APPROVE" ? "APPROVED" : "REJECTED",
        rejectReason: body.action === "REJECT" ? body.rejectReason?.trim() : null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });

    await writeAudit({
      actorId: admin.id,
      action: body.action === "APPROVE" ? "KYC_APPROVED" : "KYC_REJECTED",
      entityType: "KycSubmission",
      entityId: kyc.id,
      meta: { storeId: kyc.storeId, rejectReason: body.rejectReason },
    });

    return jsonOk({ ok: true, kyc: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
