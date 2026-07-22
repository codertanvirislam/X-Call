import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, underscores"),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  serviceType: z.enum(["HUMAN", "AI"]),
  priceBdt: z.number().int().positive(),
  minutes: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  features: z.string().max(500).optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  try {
    await requireAdmin();
    const packages = await prisma.package.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceBdt: "asc" }],
      include: { _count: { select: { orders: true } } },
    });
    return jsonOk({ packages });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { admin } = await requireAdmin();
    const body = createSchema.parse(await req.json());

    // Check code uniqueness
    const existing = await prisma.package.findUnique({ where: { code: body.code } });
    if (existing) {
      return jsonOk({ error: `Package code "${body.code}" already exists` }, { status: 409 });
    }

    const pkg = await prisma.package.create({ data: body });

    await writeAudit({
      actorId: admin.id,
      actorType: "ADMIN",
      action: "PACKAGE_CREATED",
      entityType: "Package",
      entityId: pkg.id,
      meta: { code: pkg.code, name: pkg.name, priceBdt: pkg.priceBdt },
    });

    return jsonOk({ package: pkg }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
