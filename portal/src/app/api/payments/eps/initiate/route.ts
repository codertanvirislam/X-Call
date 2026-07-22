import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { env } from "@/lib/env";
import { initPayment, isEpsConfigured } from "@/lib/eps";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  orderId: z.string().min(1),
});

const CALLBACK = `${env.appUrl.replace(/\/$/, "")}/api/payments/eps/callback`;

export async function POST(req: Request) {
  try {
    if (env.payment.mode !== "eps") {
      return jsonError("EPS payment is not enabled", 403);
    }
    if (!isEpsConfigured()) {
      return jsonError("EPS gateway is not configured", 500);
    }

    const { storeUser, store } = await requireStore();
    const body = bodySchema.parse(await req.json());

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, storeId: store.id },
      include: { payment: true },
    });
    if (!order) return jsonError("Order not found", 404);

    if (order.payment?.status === "SUCCESS" || order.status === "ACTIVE") {
      return jsonError("Order is already paid", 409);
    }
    if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") {
      return jsonError(`Order cannot be paid in status ${order.status}`, 409);
    }

    // Unique per attempt; used to correlate the EPS callback back to this order.
    const merchantTransactionId = `XCALL${order.id}${randomBytes(4).toString("hex")}`;

    await prisma.payment.update({
      where: { orderId: order.id },
      data: {
        provider: "eps",
        providerPaymentId: merchantTransactionId,
        status: "PENDING",
      },
    });

    const phone = (store.phone || storeUser.phone).replace(/^\+/, "");
    const init = await initPayment({
      merchantTransactionId,
      customerOrderId: order.id,
      amountBdt: order.priceBdt,
      productName: order.packageName,
      productCategory: order.serviceType,
      customer: {
        name: store.name || "X-Call Customer",
        email: `${store.id}@customer.xcall.bd`,
        phone,
        address: "N/A",
        city: "Dhaka",
        state: "Dhaka",
        postcode: "1000",
        country: "Bangladesh",
      },
      successUrl: CALLBACK,
      failUrl: CALLBACK,
      cancelUrl: CALLBACK,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || undefined,
    });

    await writeAudit({
      actorId: storeUser.id,
      actorType: "STORE_USER",
      action: "PAYMENT_INITIATED",
      entityType: "Order",
      entityId: order.id,
      meta: { provider: "eps", merchantTransactionId },
    });

    return jsonOk({ redirectUrl: init.redirectUrl, orderId: order.id });
  } catch (err) {
    return handleRouteError(err);
  }
}
