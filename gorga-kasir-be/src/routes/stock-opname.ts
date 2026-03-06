import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const ListSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  sessionId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  status: z.enum(["open", "submitted", "approved", "rejected"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

const CreateSessionSchema = z.object({
  storeId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  notes: z.string().max(500).optional()
});

const AssignSessionSchema = z.object({
  assignedTo: z.string().uuid()
});

const SessionParamsSchema = z.object({
  id: z.string().uuid()
});

const UpsertItemsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      countedStock: z.number().int().min(0)
    })
  ).min(1)
});

type AuthContext = {
  userId: string;
  tenantId: string;
  role: "owner" | "manager" | "cashier";
  isSuperAdmin?: boolean;
};

type SessionStatus = "open" | "submitted" | "approved" | "rejected";

function getAuthOrReply(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.auth as AuthContext | undefined;
  if (!auth) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  return auth;
}

function buildCreatedAtFilter(startDate?: Date, endDate?: Date) {
  if (!startDate && !endDate) {
    return {};
  }

  return {
    createdAt: {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {})
    }
  };
}

function buildSessionScope(
  auth: AuthContext,
  options?: {
    id?: string;
    storeId?: string;
    status?: SessionStatus;
    createdAt?: { gte?: Date; lte?: Date };
    limitCashierToCreator?: boolean;
  }
) {
  const cashierScope = !auth.isSuperAdmin && auth.role === "cashier" && options?.limitCashierToCreator !== false
    ? {
        OR: [
          { createdBy: auth.userId },
          { assignedTo: auth.userId }
        ]
      }
    : {};

  const scope = {
    ...(options?.id ? { id: options.id } : {}),
    ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
    ...(options?.storeId ? { storeId: options.storeId } : {}),
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.createdAt ? { createdAt: options.createdAt } : {}),
    ...cashierScope
  };

  return scope;
}

async function hasStoreAccess(auth: AuthContext, storeId: string) {
  if (auth.isSuperAdmin) {
    return prisma.store.findUnique({ where: { id: storeId }, select: { id: true, tenantId: true, isActive: true } });
  }

  const access = await prisma.userStoreAccess.findUnique({
    where: {
      userId_storeId: {
        userId: auth.userId,
        storeId
      }
    },
    include: {
      store: { select: { id: true, tenantId: true, isActive: true } }
    }
  });

  if (!access?.store || access.store.tenantId !== auth.tenantId) {
    return null;
  }

  return access.store;
}

export async function stockOpnameRoutes(app: FastifyInstance) {
  app.get(
    "/stock-opname/sessions",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const parsed = ListSessionsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, sessionId, storeId, status, startDate, endDate } = parsed.data;
      const skip = (page - 1) * pageSize;
      const createdAtFilter = buildCreatedAtFilter(startDate, endDate);
      const where = buildSessionScope(auth, {
        id: sessionId,
        storeId,
        status,
        createdAt: "createdAt" in createdAtFilter ? createdAtFilter.createdAt : undefined
      });

      const [total, items] = await Promise.all([
        prisma.stockOpnameSession.count({ where }),
        prisma.stockOpnameSession.findMany({
          where,
          include: {
            store: { select: { id: true, name: true } },
            creator: { select: { id: true, fullName: true, email: true } },
            assignee: { select: { id: true, fullName: true, email: true } },
            assigner: { select: { id: true, fullName: true, email: true } },
            approver: { select: { id: true, fullName: true, email: true } }
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
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
    "/stock-opname/sessions",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const parsed = CreateSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const store = await hasStoreAccess(auth, parsed.data.storeId);
      if (!store || !store.isActive) {
        return reply.status(403).send({ message: "No store access" });
      }

      let assignedTo: string | null = null;
      if (parsed.data.assignedTo) {
        const assignee = await prisma.user.findFirst({
          where: {
            id: parsed.data.assignedTo,
            ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
            isActive: true
          },
          select: { id: true }
        });

        if (!assignee) {
          return reply.status(422).send({ message: "Assigned user tidak valid" });
        }

        assignedTo = assignee.id;
      }

      const created = await prisma.stockOpnameSession.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          createdBy: auth.userId,
          assignedTo,
          assignedBy: assignedTo ? auth.userId : null,
          assignedAt: assignedTo ? new Date() : null,
          notes: parsed.data.notes,
          status: "open"
        },
        include: {
          store: { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true, email: true } },
          assignee: { select: { id: true, fullName: true, email: true } },
          assigner: { select: { id: true, fullName: true, email: true } }
        }
      });

      return reply.status(201).send(created);
    }
  );

  app.get(
    "/stock-opname/sessions/:id",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const params = SessionParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const session = await prisma.stockOpnameSession.findFirst({
        where: buildSessionScope(auth, { id: params.data.id }),
        include: {
          store: { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true, email: true } },
          assignee: { select: { id: true, fullName: true, email: true } },
          assigner: { select: { id: true, fullName: true, email: true } },
          approver: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              product: { select: { id: true, sku: true, name: true } }
            },
            orderBy: { createdAt: "desc" }
          }
        }
      });

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }

      return session;
    }
  );

  app.post(
    "/stock-opname/sessions/:id/items",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const params = SessionParamsSchema.safeParse(request.params);
      const parsed = UpsertItemsSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const session = await prisma.stockOpnameSession.findFirst({
        where: buildSessionScope(auth, { id: params.data.id })
      });

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }

      if (session.status !== "open") {
        return reply.status(400).send({ message: "Session is not open" });
      }

      try {
        await prisma.$transaction(async (tx: any) => {
          for (const item of parsed.data.items) {
            const product = await tx.product.findFirst({
              where: {
                id: item.productId,
                storeId: session.storeId,
                isActive: true
              },
              select: { id: true, stockOnHand: true }
            });

            if (!product) {
              throw new Error("PRODUCT_NOT_FOUND");
            }

            const systemStock = product.stockOnHand;
            if (item.countedStock > Math.max(systemStock * 3, 5000)) {
              throw new Error("COUNTED_STOCK_OUTLIER");
            }

            const difference = item.countedStock - systemStock;

            await tx.stockOpnameItem.upsert({
              where: {
                sessionId_productId: {
                  sessionId: session.id,
                  productId: product.id
                }
              },
              create: {
                sessionId: session.id,
                productId: product.id,
                systemStock,
                countedStock: item.countedStock,
                difference
              },
              update: {
                systemStock,
                countedStock: item.countedStock,
                difference
              }
            });
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
          return reply.status(404).send({ message: "Product not found in this store" });
        }
        if (error instanceof Error && error.message === "COUNTED_STOCK_OUTLIER") {
          return reply.status(422).send({ message: "Counted stock terlalu jauh dari sistem, mohon cek ulang" });
        }
        throw error;
      }

      return { status: "saved" };
    }
  );

  app.post(
    "/stock-opname/sessions/:id/submit",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const params = SessionParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const session = await prisma.stockOpnameSession.findFirst({
        where: buildSessionScope(auth, { id: params.data.id }),
        include: { items: { select: { id: true } } }
      });

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }

      if (session.status !== "open") {
        return reply.status(400).send({ message: "Session is not open" });
      }

      if (session.items.length === 0) {
        return reply.status(400).send({ message: "Tidak ada item opname yang disimpan" });
      }

      await prisma.stockOpnameSession.update({
        where: { id: session.id },
        data: { status: "submitted" }
      });

      await writeAuditLog({
        request,
        tenantId: auth.tenantId,
        action: "stock_opname.submit",
        entityType: "stock_opname_session",
        entityId: session.id,
        beforeData: { status: session.status },
        afterData: { status: "submitted", itemCount: session.items.length }
      });

      return { status: "submitted" };
    }
  );

  app.post(
    "/stock-opname/sessions/:id/approve",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("stock-opname.approve")
      ]
    },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const params = SessionParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const session = await prisma.stockOpnameSession.findFirst({
        where: buildSessionScope(auth, {
          id: params.data.id,
          limitCashierToCreator: false
        }),
        include: {
          items: true,
          store: { select: { id: true, isActive: true } }
        }
      });

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }

      if (!session.store.isActive) {
        return reply.status(400).send({ message: "Store is inactive" });
      }

      if (session.status !== "submitted") {
        return reply.status(400).send({ message: "Session is not submitted" });
      }

      await prisma.$transaction(async (tx: any) => {
        for (const item of session.items) {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              storeId: session.storeId,
              isActive: true
            },
            data: {
              stockOnHand: item.countedStock
            }
          });

          await tx.stockMovement.create({
            data: {
              storeId: session.storeId,
              productId: item.productId,
              type: "adjustment",
              quantity: item.countedStock,
              reason: `stock_opname_approved:${session.id}`,
              referenceId: session.id
            }
          });
        }

        await tx.stockOpnameSession.update({
          where: { id: session.id },
          data: {
            status: "approved",
            approvedBy: auth.userId,
            approvedAt: new Date()
          }
        });
      });

      await writeAuditLog({
        request,
        tenantId: auth.tenantId,
        action: "stock_opname.approve",
        entityType: "stock_opname_session",
        entityId: session.id,
        beforeData: { status: session.status },
        afterData: {
          status: "approved",
          approvedBy: auth.userId,
          itemCount: session.items.length
        }
      });

      return { status: "approved" };
    }
  );

  app.patch(
    "/stock-opname/sessions/:id/assign",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const auth = getAuthOrReply(request, reply);
      if (!auth) {
        return;
      }

      const params = SessionParamsSchema.safeParse(request.params);
      const parsed = AssignSessionSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const session = await prisma.stockOpnameSession.findFirst({
        where: buildSessionScope(auth, { id: params.data.id, limitCashierToCreator: false })
      });

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }

      if (session.status !== "open") {
        return reply.status(400).send({ message: "Session harus open untuk assign" });
      }

      const assignee = await prisma.user.findFirst({
        where: {
          id: parsed.data.assignedTo,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          isActive: true
        },
        select: { id: true }
      });

      if (!assignee) {
        return reply.status(422).send({ message: "Assigned user tidak valid" });
      }

      const updated = await prisma.stockOpnameSession.update({
        where: { id: session.id },
        data: {
          assignedTo: assignee.id,
          assignedBy: auth.userId,
          assignedAt: new Date()
        },
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          assigner: { select: { id: true, fullName: true, email: true } }
        }
      });

      await writeAuditLog({
        request,
        tenantId: auth.tenantId,
        action: "stock_opname.assign",
        entityType: "stock_opname_session",
        entityId: updated.id,
        beforeData: {
          assignedTo: session.assignedTo,
          assignedBy: session.assignedBy,
          assignedAt: session.assignedAt
        },
        afterData: {
          assignedTo: updated.assignedTo,
          assignedBy: updated.assignedBy,
          assignedAt: updated.assignedAt
        }
      });

      return updated;
    }
  );
}
