import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStore, requireStoreOwner } from "@/lib/auth";
import { normalizeBdPhone } from "@/lib/phone";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  phone: z.string().min(8),
  name: z.string().min(2).max(80).optional(),
});

/** List everyone who can log into this store (owner + employees). */
export async function GET() {
  try {
    const { store } = await requireStore();
    const members = await prisma.storeUser.findMany({
      where: { storeId: store.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    return jsonOk({ members });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Owner grants an employee access by phone (whitelists the number). */
export async function POST(req: Request) {
  try {
    const { storeUser, store } = await requireStoreOwner();

    // Employees can only be added once the store is paid & KYC-approved.
    const activeSub = await prisma.subscription.findFirst({
      where: { storeId: store.id, status: "ACTIVE" },
    });
    if (!activeSub) {
      return jsonError(
        "Buy a package and activate a subscription before adding employees",
        403,
      );
    }

    const body = bodySchema.parse(await req.json());
    const phone = normalizeBdPhone(body.phone);
    if (!phone) return jsonError("Enter a valid Bangladesh mobile number");

    if (phone === storeUser.phone) {
      return jsonError("That is your own number");
    }

    // A phone can belong to only one store user / not to an admin.
    const takenByStoreUser = await prisma.storeUser.findUnique({ where: { phone } });
    if (takenByStoreUser) {
      return jsonError("That number is already registered", 409);
    }
    const takenByAdmin = await prisma.admin.findUnique({ where: { phone } });
    if (takenByAdmin) {
      return jsonError("That number is already registered", 409);
    }

    const employee = await prisma.storeUser.create({
      data: {
        storeId: store.id,
        phone,
        name: body.name,
        role: "EMPLOYEE",
        status: "INVITED", // becomes ACTIVE after they verify OTP + set a password
      },
      select: { id: true, phone: true, name: true, role: true, status: true },
    });

    await writeAudit({
      actorId: storeUser.id,
      actorType: "STORE_USER",
      action: "EMPLOYEE_INVITED",
      entityType: "StoreUser",
      entityId: employee.id,
      meta: { storeId: store.id, phone },
    });

    return jsonOk({ ok: true, employee }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
