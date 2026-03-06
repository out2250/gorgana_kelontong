import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles, requireSuperAdmin } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const TenantDetailSchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerName: z.string().min(2).max(120),
  tenantAddress: z.string().min(2).max(300),
  contactPhone: z.string().min(5).max(40),
  npwp: z.string().min(5).max(40).optional().or(z.literal("")),
  importantInfo: z.string().max(1000).optional().or(z.literal("")),
  stores: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(2).max(120),
      address: z.string().max(300).optional().or(z.literal(""))
    })
  ).default([])
});

const TenantParamSchema = z.object({ tenantId: z.string().uuid() });

type BusinessProfile = {
  npwp?: string;
  importantInfo?: string;
};

function readBusinessProfile(additionalData: unknown): BusinessProfile {
  if (!additionalData || typeof additionalData !== "object") {
    return {};
  }

  const root = additionalData as { businessProfile?: unknown };
  if (!root.businessProfile || typeof root.businessProfile !== "object") {
    return {};
  }

  const profile = root.businessProfile as Record<string, unknown>;
  return {
    ...(typeof profile.npwp === "string" ? { npwp: profile.npwp } : {}),
    ...(typeof profile.importantInfo === "string" ? { importantInfo: profile.importantInfo } : {})
  };
}

function writeBusinessProfile(additionalData: unknown, profile: BusinessProfile) {
  const root = additionalData && typeof additionalData === "object"
    ? { ...(additionalData as Record<string, unknown>) }
    : {};

  root.businessProfile = {
    ...(profile.npwp ? { npwp: profile.npwp } : {}),
    ...(profile.importantInfo ? { importantInfo: profile.importantInfo } : {})
  };

  return root;
}

function maskSensitive(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const cleaned = value.trim();
  if (cleaned.length <= 4) {
    return "****";
  }

  const head = cleaned.slice(0, 2);
  const tail = cleaned.slice(-2);
  return `${head}${"*".repeat(Math.max(cleaned.length - 4, 2))}${tail}`;
}

export async function tenantDetailRoutes(app: FastifyInstance) {
  app.get(
    "/tenant-store-detail",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        include: {
          stores: {
            where: { isActive: true },
            select: { id: true, name: true, address: true, isActive: true }
          }
        }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const businessProfile = readBusinessProfile(tenant.additionalData);

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          ownerName: tenant.fullName ?? "",
          address: tenant.address ?? "",
          contactPhone: tenant.contactPhone ?? "",
          npwp: businessProfile.npwp ?? "",
          importantInfo: businessProfile.importantInfo ?? ""
        },
        stores: tenant.stores
      };
    }
  );

  app.patch(
    "/tenant-store-detail",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = TenantDetailSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;
      const existingTenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { additionalData: true }
      });

      if (!existingTenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const requestedStoreIds = payload.stores.map((item) => item.id);
      const validStores = requestedStoreIds.length
        ? await prisma.store.findMany({
          where: {
            id: { in: requestedStoreIds },
            tenantId: auth.tenantId,
            isActive: true
          },
          select: { id: true }
        })
        : [];

      if (validStores.length !== requestedStoreIds.length) {
        return reply.status(422).send({ message: "One or more stores are invalid for this tenant" });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.tenant.update({
          where: { id: auth.tenantId },
          data: {
            name: payload.tenantName,
            fullName: payload.ownerName,
            address: payload.tenantAddress,
            contactPhone: payload.contactPhone,
            additionalData: writeBusinessProfile(existingTenant.additionalData, {
              npwp: payload.npwp || "",
              importantInfo: payload.importantInfo || ""
            }) as unknown as object
          }
        });

        for (const item of payload.stores) {
          await tx.store.update({
            where: { id: item.id },
            data: {
              name: item.name,
              address: item.address || null
            }
          });
        }
      });

      return { status: "updated" };
    }
  );

  app.get(
    "/admin/tenants/:tenantId/detail",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: params.data.tenantId },
        include: {
          stores: {
            where: { isActive: true },
            select: { id: true, name: true, address: true, isActive: true }
          }
        }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const businessProfile = readBusinessProfile(tenant.additionalData);

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          ownerName: maskSensitive(tenant.fullName ?? ""),
          address: maskSensitive(tenant.address ?? ""),
          contactPhone: maskSensitive(tenant.contactPhone ?? ""),
          npwp: maskSensitive(businessProfile.npwp ?? ""),
          importantInfo: businessProfile.importantInfo ? "[hidden]" : ""
        },
        stores: tenant.stores
      };
    }
  );
}
