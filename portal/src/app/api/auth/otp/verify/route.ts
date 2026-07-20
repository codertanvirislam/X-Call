import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeBdPhone } from "@/lib/phone";
import { hashOtp, safeEqual } from "@/lib/crypto";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { setSessionCookie } from "@/lib/session";

const bodySchema = z.object({
  phone: z.string().min(8),
  code: z.string().min(4).max(8),
  purpose: z.enum(["SIGNUP", "RESET_PASSWORD"]).default("SIGNUP"),
  name: z.string().min(2).max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const phone = normalizeBdPhone(body.phone);
    if (!phone) return jsonError("Invalid phone number");

    const challenge = await prisma.otpChallenge.findFirst({
      where: {
        phone,
        purpose: body.purpose,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) return jsonError("OTP not found. Request a new one.");
    if (challenge.expiresAt < new Date()) return jsonError("OTP expired");
    if (challenge.attempts >= challenge.maxAttempts) {
      return jsonError("Too many attempts. Request a new OTP.");
    }

    const ok = safeEqual(challenge.codeHash, hashOtp(body.code.trim()));
    if (!ok) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return jsonError("Incorrect OTP", 401);
    }

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: body.name,
          phoneVerifiedAt: new Date(),
          role: "USER",
        },
      });
    } else if (!user.phoneVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
          name: body.name || user.name,
        },
      });
    }

    // Temporary session so user can set/reset password
    await setSessionCookie({
      userId: user.id,
      role: user.role,
      phone: user.phone,
    });

    return jsonOk({
      ok: true,
      needsPassword: !user.passwordHash || body.purpose === "RESET_PASSWORD",
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
