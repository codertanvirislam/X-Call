import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { provisionPaidOrder } from "@/lib/provisioning";

const bodySchema = z.object({
  action: z.enum(["RETRY_PROVISION", "CANCEL"]),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const { action } = bodySchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id },
      include: { payment: true, subscription: true },
    });
    if (!order) return jsonError("Order not found", 404);

    if (action === "RETRY_PROVISION") {
      if (order.status !== "PROVISIONING_FAILED") {
        return jsonError("Can only retry provisioning on failed orders", 400);
      }

      await writeAudit({
        actorId: admin.id,
        actorType: "ADMIN",
        action: "ORDER_PROVISION_RETRY",
        entityType: "Order",
        entityId: order.id,
        meta: { previousError: order.provisionError },
      });

      try {
        const updated = await provisionPaidOrder(order.id);
        return jsonOk({ order: updated, message: "Provisioning retried successfully" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Retry failed";
        return jsonError(`Retry failed: ${message}`, 500);
      }
    }

    if (action === "CANCEL") {
      if (!["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(order.status)) {
        return jsonError("Can only cancel orders that are pending payment or payment-failed", 400);
      }

      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });

        if (order.payment && order.payment.status === "PENDING") {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: { status: "CANCELLED" },
          });
        }
      });

      await writeAudit({
        actorId: admin.id,
        actorType: "ADMIN",
        action: "ORDER_CANCELLED",
        entityType: "Order",
        entityId: order.id,
        meta: { previousStatus: order.status },
      });

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
        include: { payment: true, subscription: true },
      });
      return jsonOk({ order: updated, message: "Order cancelled" });
    }

    return jsonError("Unknown action", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
