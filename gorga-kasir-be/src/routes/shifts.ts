import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const OpenShiftSchema = z.object({
  storeId: z.string().uuid(),
  openingCash: z.number().min(0)
});

const CloseShiftSchema = z.object({
  closingCash: z.number().min(0),
  notes: z.string().max(500).optional()
});

const CurrentShiftQuerySchema = z.object({
  storeId: z.string().uuid()
});

const HistoryShiftQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  storeId: z.string().uuid().optional(),
  status: z.enum(["open", "closed"]).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

const ShiftRecapQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

type AuthContext = {
  userId: string;
  tenantId: string;
  role: "owner" | "manager" | "cashier";
  isSuperAdmin?: boolean;
};

async function resolveStoreScope(auth: AuthContext, storeId: string) {

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
      store: {
        select: { id: true, tenantId: true, isActive: true }
      }
    }
  });

  if (!access?.store || access.store.tenantId !== auth.tenantId) {
    return null;
  }

  return access.store;
}

export async function shiftRoutes(app: FastifyInstance) {
  app.get(
    "/shifts/current",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CurrentShiftQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const store = await resolveStoreScope(auth, parsed.data.storeId);
      if (!store || !store.isActive) {
        return reply.status(403).send({ message: "No store access" });
      }

      const shift = await prisma.cashierShift.findFirst({
        where: {
          storeId: store.id,
          status: "open",
          ...(auth.isSuperAdmin ? {} : { openedByUserId: auth.userId })
        },
        include: {
          store: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } }
        },
        orderBy: { openedAt: "desc" }
      });

      return shift;
    }
  );

  app.get(
    "/shifts/history",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = HistoryShiftQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, status, startDate, endDate } = parsed.data;
      const skip = (page - 1) * pageSize;

      const openedAtRange: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        openedAtRange.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        openedAtRange.lte = new Date(`${endDate}T23:59:59.999Z`);
      }

      const where = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(storeId ? { storeId } : {}),
        ...(status ? { status } : {}),
        ...(Object.keys(openedAtRange).length > 0 ? { openedAt: openedAtRange } : {}),
        ...(!auth.isSuperAdmin && auth.role === "cashier" ? { openedByUserId: auth.userId } : {})
      };

      const [total, items] = await Promise.all([
        prisma.cashierShift.count({ where }),
        prisma.cashierShift.findMany({
          where,
          include: {
            store: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true, email: true } }
          },
          orderBy: { openedAt: "desc" },
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
    "/shifts/open",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = OpenShiftSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const store = await resolveStoreScope(auth, parsed.data.storeId);
      if (!store || !store.isActive) {
        return reply.status(403).send({ message: "No store access" });
      }

      const existing = await prisma.cashierShift.findFirst({
        where: {
          storeId: store.id,
          status: "open",
          ...(auth.isSuperAdmin ? {} : { openedByUserId: auth.userId })
        }
      });

      if (existing) {
        return reply.status(409).send({ message: "Shift already open" });
      }

      const shift = await prisma.cashierShift.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          openedByUserId: auth.userId,
          openingCash: parsed.data.openingCash,
          status: "open"
        },
        include: {
          store: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } }
        }
      });

      return reply.status(201).send(shift);
    }
  );

  app.post(
    "/shifts/:id/close",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = CloseShiftSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const shift = await prisma.cashierShift.findFirst({
        where: {
          id: params.data.id,
          status: "open",
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          ...(!auth.isSuperAdmin && auth.role === "cashier" ? { openedByUserId: auth.userId } : {})
        }
      });

      if (!shift) {
        return reply.status(404).send({ message: "Open shift not found" });
      }

      const salesAgg = await prisma.sale.aggregate({
        _sum: { total: true },
        where: {
          storeId: shift.storeId,
          cashierUserId: shift.openedByUserId,
          soldAt: {
            gte: shift.openedAt,
            lte: new Date()
          }
        }
      });

      const salesTotal = Number(salesAgg._sum.total ?? 0);
      const openingCash = Number(shift.openingCash);
      const expectedCash = openingCash + salesTotal;
      const cashDifference = parsed.data.closingCash - expectedCash;

      const updated = await prisma.cashierShift.update({
        where: { id: shift.id },
        data: {
          status: "closed",
          closingCash: parsed.data.closingCash,
          expectedCash,
          cashDifference,
          notes: parsed.data.notes,
          closedAt: new Date()
        },
        include: {
          store: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } }
        }
      });

      return {
        ...updated,
        salesTotal
      };
    }
  );

  app.get(
    "/shifts/recap",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ShiftRecapQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { storeId, startDate, endDate } = parsed.data;
      const openedAtRange: { gte?: Date; lte?: Date } = {};

      if (startDate) {
        openedAtRange.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        openedAtRange.lte = new Date(`${endDate}T23:59:59.999Z`);
      }

      const shifts = await prisma.cashierShift.findMany({
        where: {
          status: "closed",
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          ...(storeId ? { storeId } : {}),
          ...(Object.keys(openedAtRange).length > 0 ? { openedAt: openedAtRange } : {}),
          ...(!auth.isSuperAdmin && auth.role === "cashier" ? { openedByUserId: auth.userId } : {})
        },
        include: {
          store: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, email: true } }
        },
        orderBy: { openedAt: "desc" }
      });

      const bucket = new Map<
        string,
        {
          date: string;
          cashier: { id: string; fullName: string; email: string };
          store: { id: string; name: string };
          shiftCount: number;
          totalOpeningCash: number;
          totalExpectedCash: number;
          totalClosingCash: number;
          totalDifference: number;
        }
      >();

      for (const shift of shifts) {
        const date = shift.openedAt.toISOString().slice(0, 10);
        const key = `${date}:${shift.openedByUserId}:${shift.storeId}`;
        const current = bucket.get(key) ?? {
          date,
          cashier: shift.user,
          store: shift.store,
          shiftCount: 0,
          totalOpeningCash: 0,
          totalExpectedCash: 0,
          totalClosingCash: 0,
          totalDifference: 0
        };

        current.shiftCount += 1;
        current.totalOpeningCash += Number(shift.openingCash ?? 0);
        current.totalExpectedCash += Number(shift.expectedCash ?? 0);
        current.totalClosingCash += Number(shift.closingCash ?? 0);
        current.totalDifference += Number(shift.cashDifference ?? 0);

        bucket.set(key, current);
      }

      const items = Array.from(bucket.values()).sort((a, b) => {
        if (a.date !== b.date) {
          return a.date < b.date ? 1 : -1;
        }
        return a.cashier.fullName.localeCompare(b.cashier.fullName);
      });

      const summary = items.reduce(
        (acc, item) => {
          acc.shiftCount += item.shiftCount;
          acc.totalOpeningCash += item.totalOpeningCash;
          acc.totalExpectedCash += item.totalExpectedCash;
          acc.totalClosingCash += item.totalClosingCash;
          acc.totalDifference += item.totalDifference;
          return acc;
        },
        {
          shiftCount: 0,
          totalOpeningCash: 0,
          totalExpectedCash: 0,
          totalClosingCash: 0,
          totalDifference: 0
        }
      );

      return {
        items,
        summary
      };
    }
  );
}
