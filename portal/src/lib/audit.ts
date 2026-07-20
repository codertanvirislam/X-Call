import { prisma } from "./prisma";

export async function writeAudit(opts: {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}
