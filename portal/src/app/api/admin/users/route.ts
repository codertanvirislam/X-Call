import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { expireDueSubscriptions } from "@/lib/provisioning";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    await expireDueSubscriptions();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const users = await prisma.user.findMany({
      where: {
        role: "USER",
        OR: q
          ? [
              { phone: { contains: q } },
              { name: { contains: q } },
            ]
          : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        kyc: true,
        selxCredential: {
          select: {
            selxUserId: true,
            selxUserSlug: true,
            extension: true,
            createdAt: true,
            bearerTokenEnc: true,
          },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { payment: true },
        },
      },
    });

    const shaped = users.map((u) => ({
      ...u,
      selxCredential: u.selxCredential
        ? {
            selxUserId: u.selxCredential.selxUserId,
            selxUserSlug: u.selxCredential.selxUserSlug,
            extension: u.selxCredential.extension,
            createdAt: u.selxCredential.createdAt,
            hasToken: Boolean(u.selxCredential.bearerTokenEnc),
          }
        : null,
    }));

    return jsonOk({ users: shaped });
  } catch (err) {
    return handleRouteError(err);
  }
}
