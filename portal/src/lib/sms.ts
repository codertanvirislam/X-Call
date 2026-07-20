import { env } from "./env";

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const message = `X-Call OTP: ${code}. Valid for ${env.sms.otpExpiryMinutes} minutes. Do not share.`;

  if (env.sms.devMode) {
    console.log(`[SMS_DEV] to=${phone} message="${message}"`);
    return;
  }

  if (!env.sms.apiUrl || !env.sms.apiKey) {
    throw new Error("SMS provider is not configured");
  }

  const res = await fetch(env.sms.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.sms.apiKey}`,
    },
    body: JSON.stringify({
      to: phone,
      from: env.sms.senderId || undefined,
      message,
      text: message,
      phone,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SMS send failed (${res.status}): ${body}`);
  }
}
