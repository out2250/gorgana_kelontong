import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireActiveSubscription } from "../middlewares/subscription";

const SummaryQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  date: z.string().date().optional(),
  period: z.enum(["daily", "weekly"]).default("daily")
});

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/dashboard/summary",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = SummaryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const selectedDate = parsed.data.date ? new Date(`${parsed.data.date}T00:00:00.000Z`) : new Date();
      const startAt = new Date(selectedDate);
      startAt.setUTCHours(0, 0, 0, 0);

      const endAt = new Date(selectedDate);
      endAt.setUTCHours(23, 59, 59, 999);

      if (parsed.data.period === "weekly") {
        startAt.setUTCDate(startAt.getUTCDate() - 6);
      }

      const saleWhere = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(parsed.data.storeId ? { storeId: parsed.data.storeId } : {}),
        soldAt: {
          gte: startAt,
          lte: endAt
        }
      };

      const expenseWhere = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(parsed.data.storeId ? { storeId: parsed.data.storeId } : {}),
        spentAt: {
          gte: startAt,
          lte: endAt
        }
      };

      const productWhere = {
        isActive: true,
        store: {
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          ...(parsed.data.storeId ? { id: parsed.data.storeId } : {})
        }
      };

      const [salesAgg, expenseAgg, transactionCount, products, rangeSales, rangeSaleItems] = await Promise.all([
        prisma.sale.aggregate({
          _sum: { total: true },
          where: saleWhere
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: expenseWhere
        }),
        prisma.sale.count({ where: saleWhere }),
        prisma.product.findMany({
          where: productWhere,
          select: {
            id: true,
            name: true,
            sku: true,
            stockOnHand: true,
            minimumStock: true
          },
          orderBy: { stockOnHand: "asc" },
          take: 500
        }),
        prisma.sale.findMany({
          where: saleWhere,
          select: {
            soldAt: true
          },
          take: 5000
        }),
        prisma.saleItem.findMany({
          where: {
            sale: saleWhere
          },
          select: {
            quantity: true,
            lineTotal: true,
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                category: true,
                costPrice: true
              }
            }
          },
          take: 10000
        })
      ]);

      const salesTotal = Number(salesAgg._sum.total ?? 0);
      const expenseTotal = Number(expenseAgg._sum.amount ?? 0);
      const grossProfitEstimate = Math.max(salesTotal - expenseTotal, 0);

      const rangeDays = Math.max(
        Math.floor((endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        1
      );

      const productDailySalesMap = new Map<string, number>();
      for (const saleItem of rangeSaleItems) {
        const currentQty = productDailySalesMap.get(saleItem.product.id) ?? 0;
        productDailySalesMap.set(saleItem.product.id, currentQty + saleItem.quantity / rangeDays);
      }

      const lowStockFiltered = products.filter((item: {
        id: string;
        stockOnHand: number;
        minimumStock: number;
      }) => {
        const avgDailySales = productDailySalesMap.get(item.id) ?? 0;
        const dynamicThreshold = Math.max(item.minimumStock, Math.ceil(avgDailySales * 2));
        return item.stockOnHand <= dynamicThreshold;
      });

      const lowStockItems = lowStockFiltered
        .slice(0, 5)
        .map((item: {
          id: string;
          sku: string;
          name: string;
          stockOnHand: number;
          minimumStock: number;
        }) => {
          const avgDailySales = Number((productDailySalesMap.get(item.id) ?? 0).toFixed(2));
          const leadTimeDays = 3;
          const safetyStock = Math.max(item.minimumStock, Math.ceil(avgDailySales * 2));
          const recommendedRestockQty = Math.max(Math.ceil(avgDailySales * leadTimeDays + safetyStock - item.stockOnHand), 1);

          return {
            id: item.id,
            sku: item.sku,
            name: item.name,
            stockOnHand: item.stockOnHand,
            minimumStock: item.minimumStock,
            avgDailySales,
            recommendedRestockQty
          };
        });

      const topProductMap = new Map<string, { id: string; sku: string; name: string; quantity: number; revenue: number }>();
      const categoryMap = new Map<string, { category: string; revenue: number; estimatedCost: number; grossMargin: number }>();

      for (const saleItem of rangeSaleItems) {
        const productId = saleItem.product.id;
        const existingTop = topProductMap.get(productId) ?? {
          id: productId,
          sku: saleItem.product.sku,
          name: saleItem.product.name,
          quantity: 0,
          revenue: 0
        };

        existingTop.quantity += saleItem.quantity;
        existingTop.revenue += Number(saleItem.lineTotal);
        topProductMap.set(productId, existingTop);

        const categoryName = saleItem.product.category || "Tanpa Kategori";
        const existingCategory = categoryMap.get(categoryName) ?? {
          category: categoryName,
          revenue: 0,
          estimatedCost: 0,
          grossMargin: 0
        };

        const lineRevenue = Number(saleItem.lineTotal);
        const lineCost = Number(saleItem.product.costPrice ?? 0) * saleItem.quantity;
        existingCategory.revenue += lineRevenue;
        existingCategory.estimatedCost += lineCost;
        existingCategory.grossMargin += Math.max(lineRevenue - lineCost, 0);
        categoryMap.set(categoryName, existingCategory);
      }

      const topProducts = Array.from(topProductMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const soldProductIdsInRange = new Set(Array.from(topProductMap.keys()));
      const slowMovingBase = products
        .filter((item: { id: string }) => !soldProductIdsInRange.has(item.id))
        .sort((a: { stockOnHand: number }, b: { stockOnHand: number }) => b.stockOnHand - a.stockOnHand)
        .slice(0, 5);

      const slowMovingIds = slowMovingBase.map((item: { id: string }) => item.id);
      const slowMovingLastSales = slowMovingIds.length > 0
        ? await prisma.saleItem.findMany({
            where: {
              productId: { in: slowMovingIds },
              sale: {
                ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
                ...(parsed.data.storeId ? { storeId: parsed.data.storeId } : {}),
                soldAt: {
                  lt: startAt
                }
              }
            },
            select: {
              productId: true,
              sale: {
                select: {
                  soldAt: true
                }
              }
            },
            orderBy: {
              sale: {
                soldAt: "desc"
              }
            },
            take: 2000
          })
        : [];

      const lastSoldAtByProduct = new Map<string, Date>();
      for (const row of slowMovingLastSales) {
        if (!lastSoldAtByProduct.has(row.productId)) {
          lastSoldAtByProduct.set(row.productId, row.sale.soldAt);
        }
      }

      const slowMovingProducts = slowMovingBase
        .map((item: { id: string; sku: string; name: string; stockOnHand: number }) => {
          const lastSoldAt = lastSoldAtByProduct.get(item.id);
          const daysWithoutSale = lastSoldAt
            ? Math.max(Math.floor((endAt.getTime() - lastSoldAt.getTime()) / (1000 * 60 * 60 * 24)), 1)
            : null;

          return {
            id: item.id,
            sku: item.sku,
            name: item.name,
            stockOnHand: item.stockOnHand,
            daysWithoutSale
          };
        });

      const busyHourMap = new Map<number, number>();
      for (const sale of rangeSales) {
        const hour = sale.soldAt.getUTCHours();
        busyHourMap.set(hour, (busyHourMap.get(hour) ?? 0) + 1);
      }

      const busyHours = Array.from(busyHourMap.entries())
        .map(([hour, transactions]) => ({ hour, transactions }))
        .sort((a, b) => b.transactions - a.transactions)
        .slice(0, 5);

      const categoryMargins = Array.from(categoryMap.values())
        .sort((a, b) => b.grossMargin - a.grossMargin)
        .slice(0, 8);

      return {
        period: parsed.data.period,
        rangeStart: startAt.toISOString().slice(0, 10),
        rangeEnd: endAt.toISOString().slice(0, 10),
        date: startAt.toISOString().slice(0, 10),
        salesTotal,
        expenseTotal,
        grossProfitEstimate,
        transactionCount,
        lowStockCount: lowStockFiltered.length,
        lowStockItems,
        topProducts,
        slowMovingProducts,
        busyHours,
        categoryMargins
      };
    }
  );
}
