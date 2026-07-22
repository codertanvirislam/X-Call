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

    let storeUser = await prisma.storeUser.findUnique({ where: { phone } });
    if (!storeUser) {
      // Brand-new signup: create a store and make this person its owner.
      const store = await prisma.store.create({
        data: {
          name: body.name,
          phone,
          members: {
            create: {
              phone,
              name: body.name,
              role: "OWNER",
              status: "INVITED", // becomes ACTIVE once password is set
              phoneVerifiedAt: new Date(),
            },
          },
        },
        include: { members: true },
      });
      storeUser = store.members[0];
    } else if (!storeUser.phoneVerifiedAt) {
      // Owner-invited employee (or unverified owner) verifying for the first time.
      storeUser = await prisma.storeUser.update({
        where: { id: storeUser.id },
        data: {
          phoneVerifiedAt: new Date(),
          name: body.name || storeUser.name,
        },
      });
    }

    // Temporary session so the person can set/reset their password
    await setSessionCookie({
      kind: "STORE",
      userId: storeUser.id,
      phone: storeUser.phone,
      storeId: storeUser.storeId,
      storeRole: storeUser.role,
    });

    return jsonOk({
      ok: true,
      needsPassword: !storeUser.passwordHash || body.purpose === "RESET_PASSWORD",
      user: {
        id: storeUser.id,
        phone: storeUser.phone,
        name: storeUser.name,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
