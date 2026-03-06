import { randomUUID } from "crypto";

import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

type PromoRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discountPercent: number;
  category?: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const CreatePromoSchema = z.object({
  code: z.string().min(3).max(30).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(2).max(100),
  description: z.string().max(300).optional(),
  discountPercent: z.number().min(1).max(100),
  category: z.string().max(100).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isActive: z.boolean().default(true)
});

const ListPromoQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  onlyActive: z.coerce.boolean().optional(),
  at: z.string().datetime().optional()
});

const PromoParamSchema = z.object({
  id: z.string().min(1)
});

const UpdatePromoStatusSchema = z.object({
  isActive: z.boolean()
});

function readPromosFromAdditionalData(additionalData: unknown): PromoRecord[] {
  if (!additionalData || typeof additionalData !== "object") {
    return [];
  }

  const root = additionalData as { promotions?: unknown };
  if (!Array.isArray(root.promotions)) {
    return [];
  }

  return root.promotions.filter((promo): promo is PromoRecord => {
    return Boolean(
      promo
      && typeof promo === "object"
      && typeof (promo as PromoRecord).id === "string"
      && typeof (promo as PromoRecord).code === "string"
      && typeof (promo as PromoRecord).name === "string"
      && typeof (promo as PromoRecord).discountPercent === "number"
      && typeof (promo as PromoRecord).startAt === "string"
      && typeof (promo as PromoRecord).endAt === "string"
      && typeof (promo as PromoRecord).isActive === "boolean"
      && typeof (promo as PromoRecord).createdAt === "string"
      && typeof (promo as PromoRecord).updatedAt === "string"
    );
  });
}

function writePromosToAdditionalData(additionalData: unknown, promotions: PromoRecord[]) {
  const current = additionalData && typeof additionalData === "object"
    ? additionalData as Record<string, unknown>
    : {};

  return {
    ...current,
    promotions
  };
}

export async function promotionRoutes(app: FastifyInstance) {
  app.get(
    "/promos",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ListPromoQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const { search, category, onlyActive, at } = parsed.data;
      const keyword = search?.trim().toLowerCase() ?? "";
      const checkAt = at ? new Date(at).getTime() : null;

      const items = readPromosFromAdditionalData(tenant.additionalData)
        .filter((promo) => {
          if (onlyActive && !promo.isActive) {
            return false;
          }

          if (keyword) {
            const text = `${promo.code} ${promo.name} ${promo.description ?? ""}`.toLowerCase();
            if (!text.includes(keyword)) {
              return false;
            }
          }

          if (category && category.trim()) {
            if ((promo.category ?? "") !== category.trim()) {
              return false;
            }
          }

          if (checkAt) {
            const startMs = new Date(promo.startAt).getTime();
            const endMs = new Date(promo.endAt).getTime();
            if (checkAt < startMs || checkAt > endMs) {
              return false;
            }
          }

          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return { items };
    }
  );

  app.post(
    "/promos",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreatePromoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;
      const startAt = new Date(payload.startAt);
      const endAt = new Date(payload.endAt);

      if (endAt.getTime() <= startAt.getTime()) {
        return reply.status(422).send({ message: "Waktu promo tidak valid" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const promotions = readPromosFromAdditionalData(tenant.additionalData);
      const normalizedCode = payload.code.trim().toUpperCase();

      const duplicate = promotions.some((promo) => promo.code.toUpperCase() === normalizedCode);
      if (duplicate) {
        return reply.status(409).send({ message: "Kode promo sudah digunakan" });
      }

      const now = new Date().toISOString();
      const nextPromo: PromoRecord = {
        id: randomUUID(),
        code: normalizedCode,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        discountPercent: payload.discountPercent,
        category: payload.category?.trim() || null,
        startAt: payload.startAt,
        endAt: payload.endAt,
        isActive: payload.isActive,
        createdAt: now,
        updatedAt: now
      };

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          additionalData: writePromosToAdditionalData(tenant.additionalData, [nextPromo, ...promotions])
        }
      });

      return reply.status(201).send(nextPromo);
    }
  );

  app.patch(
    "/promos/:id/status",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = PromoParamSchema.safeParse(request.params);
      const parsed = UpdatePromoStatusSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const promotions = readPromosFromAdditionalData(tenant.additionalData);
      const target = promotions.find((promo) => promo.id === params.data.id);
      if (!target) {
        return reply.status(404).send({ message: "Promo not found" });
      }

      const nextPromotions = promotions.map((promo) => {
        if (promo.id !== params.data.id) {
          return promo;
        }

        return {
          ...promo,
          isActive: parsed.data.isActive,
          updatedAt: new Date().toISOString()
        };
      });

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          additionalData: writePromosToAdditionalData(tenant.additionalData, nextPromotions)
        }
      });

      return nextPromotions.find((promo) => promo.id === params.data.id);
    }
  );
}
