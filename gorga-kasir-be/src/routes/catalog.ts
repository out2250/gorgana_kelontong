import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const listMasterQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50)
});

const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  parentId: z.string().uuid().optional(),
  isActive: z.boolean().default(true)
});

const createBrandSchema = z.object({
  name: z.string().min(2).max(100),
  isActive: z.boolean().default(true)
});

const createSupplierSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  address: z.string().max(255).optional(),
  isActive: z.boolean().default(true)
});

function paginate(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

function withKeyword(keyword?: string) {
  if (!keyword?.trim()) {
    return {};
  }

  return {
    name: {
      contains: keyword.trim(),
      mode: "insensitive" as const
    }
  };
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get(
    "/catalog/categories",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = listMasterQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, isActive } = parsed.data;
      const where = {
        tenantId,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...withKeyword(search)
      };

      const { skip, take } = paginate(page, pageSize);

      const [total, items] = await Promise.all([
        prisma.category.count({ where }),
        prisma.category.findMany({
          where,
          include: {
            parent: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: [{ name: "asc" }],
          skip,
          take
        })
      ]);

      return {
        items,
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
    "/catalog/categories",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = createCategorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      if (parsed.data.parentId) {
        const parent = await prisma.category.findFirst({
          where: { id: parsed.data.parentId, tenantId },
          select: { id: true }
        });

        if (!parent) {
          return reply.status(422).send({ message: "Parent category tidak valid" });
        }
      }

      const created = await prisma.category.create({
        data: {
          tenantId,
          name: parsed.data.name.trim(),
          parentId: parsed.data.parentId,
          isActive: parsed.data.isActive
        }
      });

      return reply.status(201).send(created);
    }
  );

  app.get(
    "/catalog/brands",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = listMasterQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, isActive } = parsed.data;
      const where = {
        tenantId,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...withKeyword(search)
      };

      const { skip, take } = paginate(page, pageSize);

      const [total, items] = await Promise.all([
        prisma.brand.count({ where }),
        prisma.brand.findMany({
          where,
          orderBy: [{ name: "asc" }],
          skip,
          take
        })
      ]);

      return {
        items,
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
    "/catalog/brands",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = createBrandSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const created = await prisma.brand.create({
        data: {
          tenantId,
          name: parsed.data.name.trim(),
          isActive: parsed.data.isActive
        }
      });

      return reply.status(201).send(created);
    }
  );

  app.get(
    "/catalog/suppliers",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = listMasterQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, isActive } = parsed.data;
      const where = {
        tenantId,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...withKeyword(search)
      };

      const { skip, take } = paginate(page, pageSize);

      const [total, items] = await Promise.all([
        prisma.supplier.count({ where }),
        prisma.supplier.findMany({
          where,
          orderBy: [{ name: "asc" }],
          skip,
          take
        })
      ]);

      return {
        items,
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
    "/catalog/suppliers",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = createSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const created = await prisma.supplier.create({
        data: {
          tenantId,
          name: parsed.data.name.trim(),
          phone: parsed.data.phone?.trim() || null,
          address: parsed.data.address?.trim() || null,
          isActive: parsed.data.isActive
        }
      });

      return reply.status(201).send(created);
    }
  );
}
