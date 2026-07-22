import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        store: { select: { id: true, phone: true, name: true } },
        payment: true,
        subscription: true,
      },
    });
    return jsonOk({ orders });
  } catch (err) {
    return handleRouteError(err);
  }
}
