import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const CreateStoreSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional()
});

const UpdateStoreStatusSchema = z.object({
  isActive: z.boolean()
});

const ListStoresQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional()
});

export async function storeRoutes(app: FastifyInstance) {
  app.get(
    "/stores",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const query = ListStoresQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, isActive } = query.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(!request.auth?.isSuperAdmin ? { tenantId } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(search
          ? {
              name: {
                contains: search,
                mode: "insensitive" as const
              }
            }
          : {})
      };

      const [total, stores] = await Promise.all([
        prisma.store.count({ where }),
        prisma.store.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: stores,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1)
        }
      };
    }
  );

  app.post(
    "/stores",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner")] },
    async (request, reply) => {
      const auth = request.auth;
      const tenantId = auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateStoreSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const store = await prisma.store.create({
        data: {
          tenantId,
          name: parsed.data.name,
          address: parsed.data.address
        }
      });

      await prisma.userStoreAccess.createMany({
        data: [{
          userId: auth.userId,
          storeId: store.id
        }],
        skipDuplicates: true
      });

      return reply.status(201).send(store);
    }
  );

  app.patch(
    "/stores/:id/status",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = UpdateStoreStatusSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const updated = await prisma.store.updateMany({
        where: {
          id: params.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        data: {
          isActive: parsed.data.isActive
        }
      });

      if (updated.count === 0) {
        return reply.status(404).send({ message: "Store not found" });
      }

      const store = await prisma.store.findUnique({
        where: { id: params.data.id }
      });

      return store;
    }
  );
}
