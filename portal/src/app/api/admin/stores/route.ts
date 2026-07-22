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

    const stores = await prisma.store.findMany({
      where: q
        ? {
            OR: [
              { phone: { contains: q } },
              { name: { contains: q } },
              { members: { some: { phone: { contains: q } } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            phone: true,
            name: true,
            role: true,
            status: true,
          },
        },
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
      },
    });

    const shaped = stores.map((s) => {
      const owner = s.members.find((m) => m.role === "OWNER") ?? null;
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        createdAt: s.createdAt,
        owner,
        employeeCount: s.members.filter((m) => m.role === "EMPLOYEE").length,
        members: s.members,
        kyc: s.kyc,
        subscriptions: s.subscriptions,
        selxCredential: s.selxCredential
          ? {
              selxUserId: s.selxCredential.selxUserId,
              selxUserSlug: s.selxCredential.selxUserSlug,
              extension: s.selxCredential.extension,
              createdAt: s.selxCredential.createdAt,
              hasToken: Boolean(s.selxCredential.bearerTokenEnc),
            }
          : null,
      };
    });

    return jsonOk({ stores: shaped });
  } catch (err) {
    return handleRouteError(err);
  }
}
