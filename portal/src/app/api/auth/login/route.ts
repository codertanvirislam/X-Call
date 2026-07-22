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

    // Platform admins resolve first.
    const admin = await prisma.admin.findUnique({ where: { phone } });
    if (admin?.passwordHash && (await verifyPassword(body.password, admin.passwordHash))) {
      await setSessionCookie({
        kind: "ADMIN",
        userId: admin.id,
        phone: admin.phone,
      });
      await writeAudit({
        actorId: admin.id,
        actorType: "ADMIN",
        action: "LOGIN",
        entityType: "Admin",
        entityId: admin.id,
      });
      return jsonOk({ ok: true, role: "ADMIN", redirectTo: "/admin" });
    }

    const storeUser = await prisma.storeUser.findUnique({ where: { phone } });
    if (
      !storeUser?.passwordHash ||
      storeUser.status === "DISABLED" ||
      !(await verifyPassword(body.password, storeUser.passwordHash))
    ) {
      return jsonError("Invalid phone or password", 401);
    }

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
      action: "LOGIN",
      entityType: "StoreUser",
      entityId: storeUser.id,
    });

    return jsonOk({
      ok: true,
      role: "STORE",
      redirectTo: "/dashboard",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
