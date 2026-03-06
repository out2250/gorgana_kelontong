import { FastifyInstance } from "fastify";
import { z } from "zod";

import { writeAuditLog } from "../lib/audit";
import { isDateInClosedPeriod } from "../lib/finance-period";
import { prisma } from "../lib/prisma";
import {
  getTenantFinanceSettings,
  saveTenantFinanceSettings
} from "../lib/tenant-finance-settings";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const CreateExpenseSchema = z.object({
  storeId: z.string().uuid(),
  title: z.string().min(2),
  amount: z.number().positive(),
  notes: z.string().optional(),
  spentAt: z.string().datetime().optional()
});

const ListExpenseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  storeId: z.string().uuid().optional(),
  search: z.string().optional()
});

const ListApAgingQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

const PurchaseIdParamsSchema = z.object({
  id: z.string().uuid()
});

const ClosePeriodSchema = z.object({
  closeThroughAt: z.string().datetime()
});

const UpsertCostingMethodSchema = z.object({
  inventoryCostingMethod: z.enum(["weighted_average", "fifo"])
});

type ApAgingBucket = "0-30" | "31-60" | "61-90" | ">90";

export async function financeRoutes(app: FastifyInstance) {
  app.get(
    "/finance/summary",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const query = z.object({ storeId: z.string().uuid().optional() }).safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const saleWhere = {
        ...(request.auth?.isSuperAdmin ? {} : { tenantId }),
        ...(query.data.storeId ? { storeId: query.data.storeId } : {})
      };

      const expenseWhere = {
        ...(request.auth?.isSuperAdmin ? {} : { tenantId }),
        ...(query.data.storeId ? { storeId: query.data.storeId } : {})
      };

      const [salesAgg, expenseAgg] = await Promise.all([
        prisma.sale.aggregate({ _sum: { total: true }, where: saleWhere }),
        prisma.expense.aggregate({ _sum: { amount: true }, where: expenseWhere })
      ]);

      const salesTotal = Number(salesAgg._sum.total ?? 0);
      const expenseTotal = Number(expenseAgg._sum.amount ?? 0);

      return {
        salesTotal,
        expenseTotal,
        grossProfitEstimate: Math.max(salesTotal - expenseTotal, 0)
      };
    }
  );

  app.get(
    "/expenses",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const query = ListExpenseQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, search } = query.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(request.auth?.isSuperAdmin ? {} : { tenantId }),
        ...(storeId ? { storeId } : {}),
        ...(search
          ? {
              title: {
                contains: search,
                mode: "insensitive" as const
              }
            }
          : {})
      };

      const [total, expenses] = await Promise.all([
        prisma.expense.count({ where }),
        prisma.expense.findMany({
          where,
          include: {
            store: {
              select: { id: true, name: true }
            }
          },
          orderBy: {
            spentAt: "desc"
          },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: expenses,
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
    "/expenses",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("finance.expense.create")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateExpenseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const hasStore = await prisma.store.findFirst({
        where: {
          id: parsed.data.storeId,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        }
      });

      if (!hasStore) {
        return reply.status(403).send({ message: "Store access denied" });
      }

      const expense = await prisma.expense.create({
        data: {
          tenantId: hasStore.tenantId,
          storeId: parsed.data.storeId,
          createdBy: auth.userId,
          title: parsed.data.title,
          amount: parsed.data.amount,
          notes: parsed.data.notes,
          spentAt: parsed.data.spentAt ? new Date(parsed.data.spentAt) : new Date()
        }
      });

      return reply.status(201).send(expense);
    }
  );

  app.get(
    "/finance/ap-aging",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ListApAgingQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { storeId, page, pageSize } = parsed.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(storeId ? { storeId } : {})
      };

      const [total, purchases, settings] = await Promise.all([
        prisma.purchase.count({ where }),
        prisma.purchase.findMany({
          where,
          include: {
            supplier: { select: { id: true, name: true } },
            store: { select: { id: true, name: true } },
            items: { select: { lineTotal: true } }
          },
          orderBy: { purchasedAt: "desc" },
          skip,
          take: pageSize
        }),
        getTenantFinanceSettings(auth.tenantId)
      ]);

      const settled = new Set(settings.settledPurchaseIds ?? []);
      const now = Date.now();

      const items = purchases.map((purchase) => {
        const totalAmount = purchase.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
        const isSettled = settled.has(purchase.id);
        const outstandingAmount = isSettled ? 0 : totalAmount;
        const ageDays = Math.max(Math.floor((now - purchase.purchasedAt.getTime()) / (1000 * 60 * 60 * 24)), 0);

        const bucket: ApAgingBucket = ageDays <= 30
          ? "0-30"
          : ageDays <= 60
            ? "31-60"
            : ageDays <= 90
              ? "61-90"
              : ">90";

        return {
          id: purchase.id,
          purchasedAt: purchase.purchasedAt,
          invoiceNumber: purchase.invoiceNumber,
          supplier: purchase.supplier,
          store: purchase.store,
          totalAmount,
          outstandingAmount,
          isSettled,
          ageDays,
          bucket
        };
      });

      const summary = items.reduce(
        (acc, item) => {
          acc.totalOutstanding += item.outstandingAmount;
          acc.byBucket[item.bucket] += item.outstandingAmount;
          return acc;
        },
        {
          totalOutstanding: 0,
          byBucket: {
            "0-30": 0,
            "31-60": 0,
            "61-90": 0,
            ">90": 0
          } as Record<ApAgingBucket, number>
        }
      );

      return {
        items,
        summary,
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
    "/finance/ap-aging/:id/settle",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = PurchaseIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const purchase = await prisma.purchase.findFirst({
        where: {
          id: params.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        select: { id: true, tenantId: true }
      });

      if (!purchase) {
        return reply.status(404).send({ message: "Purchase not found" });
      }

      const settings = await getTenantFinanceSettings(purchase.tenantId);
      const settled = new Set(settings.settledPurchaseIds ?? []);
      settled.add(purchase.id);

      await saveTenantFinanceSettings(purchase.tenantId, {
        ...settings,
        settledPurchaseIds: [...settled]
      });

      await writeAuditLog({
        request,
        tenantId: purchase.tenantId,
        action: "finance.ap_settle",
        entityType: "purchase",
        entityId: purchase.id,
        afterData: { settled: true }
      });

      return { status: "settled", purchaseId: purchase.id };
    }
  );

  app.get(
    "/finance/period-closing",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const settings = await getTenantFinanceSettings(auth.tenantId);
      return {
        closedThroughAt: settings.closedThroughAt ?? null,
        closureHistory: settings.closureHistory ?? [],
        inventoryCostingMethod: settings.inventoryCostingMethod ?? "weighted_average"
      };
    }
  );

  app.post(
    "/finance/costing-method",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("finance.period.close")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = UpsertCostingMethodSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const settings = await getTenantFinanceSettings(auth.tenantId);
      await saveTenantFinanceSettings(auth.tenantId, {
        ...settings,
        inventoryCostingMethod: parsed.data.inventoryCostingMethod
      });

      await writeAuditLog({
        request,
        tenantId: auth.tenantId,
        action: "finance.costing_method.update",
        entityType: "tenant",
        entityId: auth.tenantId,
        beforeData: { inventoryCostingMethod: settings.inventoryCostingMethod ?? "weighted_average" },
        afterData: { inventoryCostingMethod: parsed.data.inventoryCostingMethod }
      });

      return {
        status: "updated",
        inventoryCostingMethod: parsed.data.inventoryCostingMethod
      };
    }
  );

  app.post(
    "/finance/period-closing/close",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("finance.period.close")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ClosePeriodSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const closeThroughAt = parsed.data.closeThroughAt;
      const settings = await getTenantFinanceSettings(auth.tenantId);

      if (isDateInClosedPeriod(closeThroughAt, settings.closedThroughAt)) {
        return reply.status(400).send({ message: "Tanggal penutupan harus lebih baru dari periode tertutup saat ini" });
      }

      const closureHistory = settings.closureHistory ?? [];
      closureHistory.unshift({
        closedAt: new Date().toISOString(),
        closedThroughAt: closeThroughAt,
        closedByUserId: auth.userId
      });

      await saveTenantFinanceSettings(auth.tenantId, {
        ...settings,
        closedThroughAt: closeThroughAt,
        closureHistory: closureHistory.slice(0, 20)
      });

      await writeAuditLog({
        request,
        tenantId: auth.tenantId,
        action: "finance.period_close",
        entityType: "tenant",
        entityId: auth.tenantId,
        beforeData: { closedThroughAt: settings.closedThroughAt ?? null },
        afterData: { closedThroughAt: closeThroughAt }
      });

      return {
        status: "closed",
        closedThroughAt: closeThroughAt
      };
    }
  );
}
