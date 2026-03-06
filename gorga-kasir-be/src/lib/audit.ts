import { FastifyRequest } from "fastify";

import { prisma } from "./prisma";

type AuditInput = {
  request: FastifyRequest;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: unknown;
  afterData?: unknown;
};

export async function writeAuditLog(input: AuditInput) {
  const auth = input.request.auth;
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId ?? auth?.tenantId ?? null,
      actorUserId: auth?.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeData: input.beforeData as any,
      afterData: input.afterData as any,
      ipAddress: input.request.ip,
      userAgent: input.request.headers["user-agent"] || null
    }
  });
}
