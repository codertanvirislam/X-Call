import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { env } from "@/lib/env";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  packageId: z.string().min(1),
});

export async function GET() {
  try {
    const { user } = await requireUser();
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { payment: true, subscription: true },
    });
    return jsonOk({ orders });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireUser();
    const body = bodySchema.parse(await req.json());

    const kyc = await prisma.kycSubmission.findUnique({
      where: { userId: user.id },
    });
    if (!kyc || kyc.status !== "APPROVED") {
      return jsonError("Complete and get KYC approved before buying a package", 403);
    }

    const pkg = await prisma.package.findFirst({
      where: { id: body.packageId, isActive: true },
    });
    if (!pkg) return jsonError("Package not found", 404);

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        packageId: pkg.id,
        packageCode: pkg.code,
        packageName: pkg.name,
        serviceType: pkg.serviceType,
        priceBdt: pkg.priceBdt,
        minutes: pkg.minutes,
        validityDays: pkg.validityDays,
        features: pkg.features,
        status: "PENDING_PAYMENT",
        payment: {
          create: {
            provider: env.payment.mode === "mock" ? "mock" : "webhook",
            amountBdt: pkg.priceBdt,
            status: "PENDING",
          },
        },
      },
      include: { payment: true },
    });

    await writeAudit({
      actorId: user.id,
      action: "ORDER_CREATED",
      entityType: "Order",
      entityId: order.id,
      meta: { packageCode: pkg.code, priceBdt: pkg.priceBdt },
    });

    return jsonOk({
      order,
      paymentMode: env.payment.mode,
      // In mock mode frontend can call mock-complete
      checkout: {
        mode: env.payment.mode,
        orderId: order.id,
        amountBdt: order.priceBdt,
      },
    }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
