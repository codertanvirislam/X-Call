import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeBdPhone } from "@/lib/phone";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const phone = normalizeBdPhone(body.phone);
    if (!phone) return jsonError("Invalid phone number");

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user?.passwordHash) {
      return jsonError("Invalid phone or password", 401);
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return jsonError("Invalid phone or password", 401);

    await setSessionCookie({
      userId: user.id,
      role: user.role,
      phone: user.phone,
    });

    await writeAudit({
      actorId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
    });

    return jsonOk({
      ok: true,
      role: user.role,
      redirectTo: user.role === "ADMIN" ? "/admin" : "/dashboard",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
