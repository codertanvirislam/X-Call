import { z } from "zod";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { markOrderPaid, verifyPaymentWebhookSecret } from "@/lib/payment";
import { prisma } from "@/lib/prisma";

/**
 * Generic payment webhook.
 * Provider must send header: X-Payment-Secret: <PAYMENT_WEBHOOK_SECRET>
 * Body:
 * {
 *   "orderId": "...",
 *   "status": "SUCCESS" | "FAILED" | "CANCELLED",
 *   "providerPaymentId": "optional",
 *   "provider": "bkash"
 * }
 */
const bodySchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILED", "CANCELLED"]),
  providerPaymentId: z.string().optional(),
  provider: z.string().default("webhook"),
});

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-payment-secret");
    if (!verifyPaymentWebhookSecret(secret)) {
      return jsonError("Invalid payment webhook secret", 401);
    }

    const raw = await req.json();
    const body = bodySchema.parse(raw);

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      include: { payment: true },
    });
    if (!order) return jsonError("Order not found", 404);

    if (body.status !== "SUCCESS") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { orderId: order.id },
          data: {
            status: body.status,
            provider: body.provider,
            providerPaymentId: body.providerPaymentId,
            rawPayload: JSON.stringify(raw),
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PAYMENT_FAILED" },
        });
      });
      return jsonOk({ ok: true, status: body.status });
    }

    const result = await markOrderPaid({
      orderId: order.id,
      provider: body.provider,
      providerPaymentId: body.providerPaymentId,
      rawPayload: raw,
    });

    return jsonOk({ ok: true, orderId: result?.id, status: result?.status });
  } catch (err) {
    return handleRouteError(err);
  }
}
