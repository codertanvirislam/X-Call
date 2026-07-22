import { prisma } from "./prisma";

export async function writeAudit(opts: {
  actorId?: string | null;
  actorType?: "ADMIN" | "STORE_USER";
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      actorType: opts.actorType ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}
