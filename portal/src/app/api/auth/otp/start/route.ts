import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeBdPhone } from "@/lib/phone";
import { hashOtp, randomOtp } from "@/lib/crypto";
import { sendOtpSms } from "@/lib/sms";
import { env } from "@/lib/env";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

const bodySchema = z.object({
  phone: z.string().min(8),
  purpose: z.enum(["SIGNUP", "RESET_PASSWORD"]).default("SIGNUP"),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const phone = normalizeBdPhone(body.phone);
    if (!phone) return jsonError("Enter a valid Bangladesh mobile number");

    const existing = await prisma.storeUser.findUnique({ where: { phone } });
    const adminExists = await prisma.admin.findUnique({ where: { phone } });

    // Phones belonging to a platform admin can't self-serve via OTP.
    if (adminExists) {
      return jsonOk({ ok: true, message: "If eligible, an OTP was sent" });
    }
    if (body.purpose === "SIGNUP" && existing?.passwordHash) {
      // Same response shape to reduce enumeration
      return jsonOk({ ok: true, message: "If eligible, an OTP was sent" });
    }
    if (body.purpose === "RESET_PASSWORD" && !existing?.passwordHash) {
      return jsonOk({ ok: true, message: "If eligible, an OTP was sent" });
    }

    const recent = await prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose: body.purpose,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      return jsonError("Please wait 60 seconds before requesting another OTP", 429);
    }

    const code = randomOtp(6);
    const expiresAt = new Date(Date.now() + env.sms.otpExpiryMinutes * 60_000);

    await prisma.otpChallenge.create({
      data: {
        phone,
        purpose: body.purpose,
        codeHash: hashOtp(code),
        expiresAt,
      },
    });

    await sendOtpSms(phone, code);

    return jsonOk({
      ok: true,
      message: "OTP sent",
      phone,
      expiresInMinutes: env.sms.otpExpiryMinutes,
      devCode: env.sms.devMode ? code : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
