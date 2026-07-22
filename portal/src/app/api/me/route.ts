import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { expireDueSubscriptions } from "@/lib/provisioning";

export async function GET() {
  try {
    const { storeUser, store } = await requireStore();
    await expireDueSubscriptions();

    const full = await prisma.store.findUnique({
      where: { id: store.id },
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

    if (!full) throw new Error("Store not found");

    // The raw bearer token is intentionally NOT returned to the browser.
    // Customers call from the platform; the token stays server-side only.
    const hasToken = Boolean(full.selxCredential?.bearerTokenEnc);

    return jsonOk({
      user: {
        id: storeUser.id,
        phone: storeUser.phone,
        name: storeUser.name,
        role: storeUser.role, // OWNER | EMPLOYEE
      },
      store: {
        id: full.id,
        name: full.name,
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
            hasToken,
          }
        : null,
      subscriptions: full.subscriptions,
      orders: full.orders,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
