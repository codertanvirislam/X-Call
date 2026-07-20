import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { hashPassword, requireSession, validatePassword } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  password: z.string().min(8),
  name: z.string().min(2).max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = bodySchema.parse(await req.json());
    const pwdError = validatePassword(body.password);
    if (pwdError) return jsonError(pwdError);

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.update({
      where: { id: session.userId },
      data: {
        passwordHash,
        name: body.name || undefined,
      },
    });

    await setSessionCookie({
      userId: user.id,
      role: user.role,
      phone: user.phone,
    });

    await writeAudit({
      actorId: user.id,
      action: "PASSWORD_SET",
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
