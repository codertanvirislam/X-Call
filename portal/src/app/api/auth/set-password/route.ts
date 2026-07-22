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
    const session = await requireSession(["STORE"]);
    const body = bodySchema.parse(await req.json());
    const pwdError = validatePassword(body.password);
    if (pwdError) return jsonError(pwdError);

    const passwordHash = await hashPassword(body.password);
    const storeUser = await prisma.storeUser.update({
      where: { id: session.userId },
      data: {
        passwordHash,
        status: "ACTIVE",
        name: body.name || undefined,
      },
    });

    await setSessionCookie({
      kind: "STORE",
      userId: storeUser.id,
      phone: storeUser.phone,
      storeId: storeUser.storeId,
      storeRole: storeUser.role,
    });

    await writeAudit({
      actorId: storeUser.id,
      actorType: "STORE_USER",
      action: "PASSWORD_SET",
      entityType: "StoreUser",
      entityId: storeUser.id,
    });

    return jsonOk({
      ok: true,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
