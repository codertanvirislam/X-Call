import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getTransactionStatus } from "@/lib/eps";
import { markOrderPaid } from "@/lib/payment";

/**
 * EPS redirect callback (success / fail / cancel all point here).
 *
 * EPS appends MerchantTransactionId & Status as query params, but those are NOT
 * trusted — we re-verify the transaction against EPS before marking the order
 * paid. On completion the browser is redirected to a user-facing page.
 */

const APP = env.appUrl.replace(/\/$/, "");

function redirectTo(path: string) {
  return NextResponse.redirect(`${APP}${path}`, { status: 303 });
}

async function handle(merchantTransactionId: string | null) {
  if (!merchantTransactionId) {
    return redirectTo("/orders?payment=error");
  }

  const payment = await prisma.payment.findFirst({
    where: { providerPaymentId: merchantTransactionId },
    include: { order: true },
  });
  if (!payment) {
    return redirectTo("/orders?payment=error");
  }

  const orderId = payment.orderId;

  // Already settled (e.g. duplicate callback) — just route to the result page.
  if (payment.status === "SUCCESS") {
    return redirectTo(`/dashboard?payment=success`);
  }

  let verified;
  try {
    verified = await getTransactionStatus(merchantTransactionId);
  } catch (err) {
    console.error("EPS verify error", err);
    return redirectTo(`/orders?payment=error`);
  }

  if (verified.isSuccess) {
    await markOrderPaid({
      orderId,
      provider: "eps",
      providerPaymentId: merchantTransactionId,
      rawPayload: verified.raw,
    });
    return redirectTo(`/dashboard?payment=success`);
  }

  // Not successful — record the outcome and send the user back to orders.
  const failStatus = verified.status === "cancelled" ? "CANCELLED" : "FAILED";
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId },
      data: {
        status: failStatus,
        provider: "eps",
        rawPayload: JSON.stringify(verified.raw),
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: "PAYMENT_FAILED" },
    });
  });

  return redirectTo(`/orders?payment=${failStatus.toLowerCase()}`);
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return handle(params.get("MerchantTransactionId") || params.get("merchantTransactionId"));
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let mtx = url.searchParams.get("MerchantTransactionId") ||
    url.searchParams.get("merchantTransactionId");

  // Some gateways POST the result as form data instead of query params.
  if (!mtx) {
    try {
      const form = await req.formData();
      mtx =
        (form.get("MerchantTransactionId") as string) ||
        (form.get("merchantTransactionId") as string) ||
        null;
    } catch {
      // ignore — fall through to null handling
    }
  }

  return handle(mtx);
}
