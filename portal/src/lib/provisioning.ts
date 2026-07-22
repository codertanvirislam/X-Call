import { addDays } from "date-fns";
import { prisma } from "./prisma";
import { selxCreateUser, selxEnableFeature, selxTopUpMinutes } from "./selx";
import { writeAudit } from "./audit";

/**
 * After real payment success:
 * 1) ensure selx user exists (create if first purchase)
 * 2) top up minutes
 * 3) enable package features
 * 4) create local subscription
 *
 * Credentials arrive asynchronously via partner webhook user.created.
 */
export async function provisionPaidOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      store: { include: { selxCredential: true, kyc: true } },
      payment: true,
    },
  });

  if (!order) throw new Error("Order not found");
  if (order.payment?.status !== "SUCCESS") {
    throw new Error("Order is not paid");
  }
  if (order.status === "ACTIVE") {
    return order;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PROVISIONING", provisionError: null },
  });

  try {
    let selxUserId = order.store.selxCredential?.selxUserId;

    if (!selxUserId) {
      if (order.store.kyc?.status !== "APPROVED") {
        throw new Error("KYC must be approved before provisioning");
      }

      const storePhone = order.store.phone || "";
      const created = await selxCreateUser({
        name: order.store.kyc.fullName || order.store.name || storePhone,
        phoneNumber: storePhone,
      });
      selxUserId = created.user_id;

      // Placeholder row until webhook delivers bearer token
      await prisma.selxCredential.upsert({
        where: { storeId: order.storeId },
        create: {
          storeId: order.storeId,
          selxUserId,
          selxUserSlug: created.user_slug,
          bearerTokenEnc: "",
          phoneNumber: storePhone,
        },
        update: {
          selxUserId,
          selxUserSlug: created.user_slug,
          phoneNumber: storePhone,
        },
      });
    }

    // Credit the package minutes exactly once per order. If a later step fails
    // and an admin retries provisioning, this guard prevents double-crediting.
    if (!order.minutesCreditedAt) {
      await selxTopUpMinutes(selxUserId, order.minutes);
      await prisma.order.update({
        where: { id: order.id },
        data: { minutesCreditedAt: new Date() },
      });
    }

    const features = order.features
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    for (const feature of features) {
      await selxEnableFeature(selxUserId, feature);
    }

    const startsAt = new Date();
    const expiresAt = addDays(startsAt, order.validityDays);

    await prisma.$transaction(async (tx) => {
      await tx.subscription.create({
        data: {
          storeId: order.storeId,
          orderId: order.id,
          serviceType: order.serviceType,
          packageCode: order.packageCode,
          packageName: order.packageName,
          minutesTotal: order.minutes,
          status: "ACTIVE",
          startsAt,
          expiresAt,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "ACTIVE",
          activatedAt: startsAt,
          expiresAt,
          provisionError: null,
        },
      });
    });

    await writeAudit({
      actorId: order.storeId,
      actorType: "STORE_USER",
      action: "ORDER_PROVISIONED",
      entityType: "Order",
      entityId: order.id,
      meta: { selxUserId, minutes: order.minutes, features },
    });

    return prisma.order.findUnique({ where: { id: order.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed";
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PROVISIONING_FAILED",
        provisionError: message,
      },
    });
    await writeAudit({
      actorId: order.storeId,
      actorType: "STORE_USER",
      action: "ORDER_PROVISION_FAILED",
      entityType: "Order",
      entityId: order.id,
      meta: { error: message },
    });
    throw err;
  }
}

/** Mark subscriptions expired when date passed. Call from cron or on dashboard load. */
export async function expireDueSubscriptions() {
  const now = new Date();
  const result = await prisma.subscription.updateMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
