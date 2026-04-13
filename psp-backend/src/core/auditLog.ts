import { PrismaClient } from "@prisma/client";

type AuditLogInput = {
  actorType: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function writeAuditLog(
  prisma: PrismaClient,
  input: AuditLogInput,
) {
  const auditRepo = (prisma as any).auditLog;

  if (!auditRepo?.create) {
    return;
  }

  await auditRepo.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      payload: input.payload || null,
    },
  });
}
