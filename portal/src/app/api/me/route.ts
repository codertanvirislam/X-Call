import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { expireDueSubscriptions } from "@/lib/provisioning";

export async function GET() {
  try {
    const { user } = await requireUser();
    await expireDueSubscriptions();

    const full = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        kyc: true,
        selxCredential: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { payment: true },
        },
      },
    });

    if (!full) throw new Error("User not found");

    let apiToken: string | null = null;
    if (full.selxCredential?.bearerTokenEnc) {
      try {
        apiToken = decryptSecret(full.selxCredential.bearerTokenEnc);
      } catch {
        apiToken = null;
      }
    }

    return jsonOk({
      user: {
        id: full.id,
        phone: full.phone,
        name: full.name,
        role: full.role,
      },
      kyc: full.kyc
        ? {
            status: full.kyc.status,
            fullName: full.kyc.fullName,
            nidNumber: full.kyc.nidNumber,
            rejectReason: full.kyc.rejectReason,
            reviewedAt: full.kyc.reviewedAt,
          }
        : { status: "NOT_STARTED" },
      credentials: full.selxCredential
        ? {
            selxUserId: full.selxCredential.selxUserId,
            selxUserSlug: full.selxCredential.selxUserSlug,
            apiToken,
            hasToken: Boolean(apiToken),
            extension: full.selxCredential.extension,
          }
        : null,
      subscriptions: full.subscriptions,
      orders: full.orders,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
