import { z } from "zod";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { markOrderPaid } from "@/lib/payment";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

/** Dev/test only: simulates a verified payment success. */
export async function POST(req: Request) {
  try {
    if (env.payment.mode !== "mock") {
      return jsonError("Mock payment is disabled", 403);
    }

    const { user } = await requireUser();
    const body = bodySchema.parse(await req.json());

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, userId: user.id },
    });
    if (!order) return jsonError("Order not found", 404);

    const result = await markOrderPaid({
      orderId: order.id,
      provider: "mock",
      providerPaymentId: `mock_${order.id}_${Date.now()}`,
      rawPayload: { source: "mock-complete" },
    });

    return jsonOk({ ok: true, order: result });
  } catch (err) {
    return handleRouteError(err);
  }
}
