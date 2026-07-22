import { prisma } from "./prisma";
import { env } from "./env";
import { provisionPaidOrder } from "./provisioning";
import { writeAudit } from "./audit";
import { safeEqual } from "./crypto";

/**
 * Mark payment successful only from trusted server-side sources
 * (mock complete in dev, or verified payment webhook in prod).
 */
export async function markOrderPaid(opts: {
  orderId: string;
  provider: string;
  providerPaymentId?: string;
  rawPayload?: unknown;
}) {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { payment: true },
  });

  if (!order) throw new Error("Order not found");
  if (order.status === "ACTIVE" || order.status === "PROVISIONING") {
    return order;
  }
  if (order.payment?.status === "SUCCESS") {
    return order;
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status: "SUCCESS",
        provider: opts.provider,
        providerPaymentId: opts.providerPaymentId,
        rawPayload: opts.rawPayload ? JSON.stringify(opts.rawPayload) : null,
        paidAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });
  });

  await writeAudit({
    actorId: order.storeId,
    actorType: "STORE_USER",
    action: "PAYMENT_SUCCESS",
    entityType: "Order",
    entityId: order.id,
    meta: {
      provider: opts.provider,
      providerPaymentId: opts.providerPaymentId,
    },
  });

  // Provision immediately after verified payment
  await provisionPaidOrder(order.id);

  return prisma.order.findUnique({
    where: { id: order.id },
    include: { payment: true, subscription: true },
  });
}

export function verifyPaymentWebhookSecret(headerValue: string | null): boolean {
  if (!headerValue) return false;
  return safeEqual(headerValue, env.payment.webhookSecret);
}
