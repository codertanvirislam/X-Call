import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  serviceType: z.enum(["HUMAN", "AI"]).optional(),
  priceBdt: z.number().int().positive().optional(),
  minutes: z.number().int().positive().optional(),
  validityDays: z.number().int().positive().optional(),
  features: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) return jsonError("Package not found", 404);

    // If code is being changed, check uniqueness (code can't be changed via this endpoint)
    const pkg = await prisma.package.update({
      where: { id },
      data: body,
    });

    await writeAudit({
      actorId: admin.id,
      actorType: "ADMIN",
      action: "PACKAGE_UPDATED",
      entityType: "Package",
      entityId: pkg.id,
      meta: { changes: body },
    });

    return jsonOk({ package: pkg });
  } catch (err) {
    return handleRouteError(err);
  }
}
