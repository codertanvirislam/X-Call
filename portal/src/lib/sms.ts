import { env } from "./env";

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const message = `X-Call OTP: ${code}. Valid for ${env.sms.otpExpiryMinutes} minutes. Do not share.`;

  if (env.sms.devMode) {
    console.log(`[SMS_DEV] to=${phone} message="${message}"`);
    return;
  }

  if (!env.sms.apiUrl || !env.sms.token) {
    throw new Error("SMS provider is not configured");
  }

  // Anbernet expects the MSISDN in local format without the leading "+".
  const receiver = phone.replace(/^\+/, "");

  const payload: Record<string, unknown> = {
    token: env.sms.token,
    senderid: env.sms.senderId,
    receivers: [receiver],
    msgdata: message,
    flashon: false,
    transtype: "T",
    campaignId: "",
  };
  // Optional — some Anbernet accounts also require account/password alongside the token.
  if (env.sms.account) payload.account = env.sms.account;
  if (env.sms.password) payload.password = env.sms.password;

  const res = await fetch(env.sms.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SMS send failed (${res.status}): ${body}`);
  }
}
