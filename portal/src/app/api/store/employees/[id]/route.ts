import { prisma } from "@/lib/prisma";
import { requireStoreOwner } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

/** Owner removes an employee from the store. Cannot remove the owner. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { storeUser, store } = await requireStoreOwner();
    const { id } = await ctx.params;

    const target = await prisma.storeUser.findUnique({ where: { id } });
    if (!target || target.storeId !== store.id) {
      return jsonError("Employee not found", 404);
    }
    if (target.role === "OWNER") {
      return jsonError("The store owner cannot be removed", 400);
    }

    await prisma.storeUser.delete({ where: { id } });

    await writeAudit({
      actorId: storeUser.id,
      actorType: "STORE_USER",
      action: "EMPLOYEE_REMOVED",
      entityType: "StoreUser",
      entityId: id,
      meta: { storeId: store.id, phone: target.phone },
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
