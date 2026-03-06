import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { env } from "../lib/env";
import { isDateInClosedPeriod } from "../lib/finance-period";
import { prisma } from "../lib/prisma";
import { getTenantFinanceSettings } from "../lib/tenant-finance-settings";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const PRODUCT_NOT_FOUND_PREFIX = "PRODUCT_NOT_FOUND:";
const INSUFFICIENT_STOCK_PREFIX = "INSUFFICIENT_STOCK:";

const PaymentBreakdownSchema = z.object({
  cash: z.number().nonnegative().default(0),
  qris: z.number().nonnegative().default(0),
  transfer: z.number().nonnegative().default(0)
});

const SyncSaleSchema = z.object({
  idempotencyKey: z.string().uuid(),
  storeId: z.string().uuid(),
  paymentMethod: z.string().min(1),
  paymentBreakdown: PaymentBreakdownSchema.optional(),
  referenceNumber: z.string().max(100).optional(),
  paidAmount: z.number().nonnegative().optional(),
  soldAt: z.string().datetime(),
  promoCode: z.string().max(50).optional(),
  discount: z.number().nonnegative(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
      discount: z.number().nonnegative().default(0)
    })
  ).min(1)
});

const PROMO_RULES: Record<string, { percent: number; startHour: number; endHour: number }> = {
  HAPPYHOUR10: { percent: 10, startHour: 13, endHour: 16 },
  PAGIPROMO5: { percent: 5, startHour: 7, endHour: 11 }
};

function getJakartaHour(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta"
  });

  return Number(formatter.format(date));
}

function calculatePromoDiscount(subtotal: number, soldAtIso: string, promoCode?: string) {
  if (!promoCode) {
    return { promoCode: null, promoDiscount: 0 };
  }

  const promo = PROMO_RULES[promoCode.toUpperCase()];
  if (!promo) {
    throw new Error("INVALID_PROMO_CODE");
  }

  const soldAt = new Date(soldAtIso);
  const hour = getJakartaHour(soldAt);
  if (hour < promo.startHour || hour >= promo.endHour) {
    throw new Error("PROMO_NOT_ACTIVE");
  }

  const promoDiscount = Math.floor((subtotal * promo.percent) / 100);
  return { promoCode: promoCode.toUpperCase(), promoDiscount };
}

function resolvePayment(payload: z.infer<typeof SyncSaleSchema>, total: number) {
  const method = payload.paymentMethod.toLowerCase();

  if (method === "split") {
    if (!payload.paymentBreakdown) {
      throw new Error("PAYMENT_BREAKDOWN_REQUIRED");
    }

    const cash = Number(payload.paymentBreakdown.cash ?? 0);
    const qris = Number(payload.paymentBreakdown.qris ?? 0);
    const transfer = Number(payload.paymentBreakdown.transfer ?? 0);

    if (cash <= 0 || qris <= 0) {
      throw new Error("SPLIT_PAYMENT_REQUIRES_CASH_QRIS");
    }

    const paidAmount = cash + qris + transfer;
    if (paidAmount < total) {
      throw new Error("INSUFFICIENT_PAYMENT");
    }

    if (!payload.referenceNumber?.trim()) {
      throw new Error("REFERENCE_REQUIRED");
    }

    return {
      paymentMethod: "split",
      paymentDetails: payload.paymentBreakdown,
      referenceNumber: payload.referenceNumber,
      paidAmount,
      changeAmount: Math.max(paidAmount - total, 0)
    };
  }

  if (method === "cash") {
    const paidAmount = Number(payload.paidAmount ?? 0);
    if (paidAmount < total) {
      throw new Error("INSUFFICIENT_PAYMENT");
    }

    return {
      paymentMethod: "cash",
      paymentDetails: null,
      referenceNumber: payload.referenceNumber,
      paidAmount,
      changeAmount: Math.max(paidAmount - total, 0)
    };
  }

  if (method === "qris" || method === "transfer") {
    if (!payload.referenceNumber?.trim()) {
      throw new Error("REFERENCE_REQUIRED");
    }

    const paidAmount = payload.paidAmount ?? total;
    if (paidAmount < total) {
      throw new Error("INSUFFICIENT_PAYMENT");
    }

    return {
      paymentMethod: method,
      paymentDetails: null,
      referenceNumber: payload.referenceNumber,
      paidAmount,
      changeAmount: 0
    };
  }

  throw new Error("INVALID_PAYMENT_METHOD");
}

export async function syncRoutes(app: FastifyInstance) {
  app.post(
    "/sync/sales",
    {
      preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager", "cashier")],
      config: {
        rateLimit: {
          max: env.rateLimitSyncMax,
          timeWindow: env.rateLimitSyncWindow
        }
      }
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = SyncSaleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;

      const hasStoreAccess = await prisma.userStoreAccess.findUnique({
        where: {
          userId_storeId: {
            userId: auth.userId,
            storeId: payload.storeId
          }
        },
        include: {
          store: true
        }
      });

      if (!hasStoreAccess || hasStoreAccess.store.tenantId !== auth.tenantId) {
        return reply.status(403).send({ message: "No store access" });
      }

      const financeSettings = await getTenantFinanceSettings(hasStoreAccess.store.tenantId);
      if (isDateInClosedPeriod(payload.soldAt, financeSettings.closedThroughAt)) {
        return reply.status(423).send({ message: "Periode sudah ditutup, transaksi tidak dapat disinkronkan" });
      }

      const existing = await prisma.sale.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: auth.tenantId,
            idempotencyKey: payload.idempotencyKey
          }
        }
      });

      if (existing) {
        return { status: "duplicate_ignored", saleId: existing.id };
      }

      const itemTotals = payload.items.map((item) => {
        const lineRaw = item.quantity * item.unitPrice;
        const lineDiscount = Math.min(Number(item.discount ?? 0), lineRaw);
        return {
          ...item,
          lineRaw,
          lineDiscount,
          lineTotal: Math.max(lineRaw - lineDiscount, 0)
        };
      });

      const subtotal = itemTotals.reduce((acc, item) => acc + item.lineTotal, 0);

      let promoResult;
      try {
        promoResult = calculatePromoDiscount(subtotal, payload.soldAt, payload.promoCode);
      } catch (error) {
        if (error instanceof Error && error.message === "INVALID_PROMO_CODE") {
          return reply.status(400).send({ message: "Promo code tidak valid" });
        }
        if (error instanceof Error && error.message === "PROMO_NOT_ACTIVE") {
          return reply.status(400).send({ message: "Promo tidak aktif pada jam ini" });
        }
        throw error;
      }

      const total = Math.max(subtotal - payload.discount - promoResult.promoDiscount, 0);

      let paymentInfo;
      try {
        paymentInfo = resolvePayment(payload, total);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "PAYMENT_BREAKDOWN_REQUIRED") {
            return reply.status(400).send({ message: "Split payment membutuhkan breakdown pembayaran" });
          }
          if (error.message === "SPLIT_PAYMENT_REQUIRES_CASH_QRIS") {
            return reply.status(400).send({ message: "Split payment minimal harus berisi cash dan qris" });
          }
          if (error.message === "INSUFFICIENT_PAYMENT") {
            return reply.status(400).send({ message: "Nominal bayar kurang dari total transaksi" });
          }
          if (error.message === "REFERENCE_REQUIRED") {
            return reply.status(400).send({ message: "Nomor referensi wajib untuk metode pembayaran ini" });
          }
          if (error.message === "INVALID_PAYMENT_METHOD") {
            return reply.status(400).send({ message: "Metode pembayaran tidak didukung" });
          }
        }
        throw error;
      }

      let result;
      try {
        result = await prisma.$transaction(async (tx) => {
          for (const item of itemTotals) {
            const updated = await tx.product.updateMany({
              where: {
                id: item.productId,
                storeId: payload.storeId,
                isActive: true,
                stockOnHand: { gte: item.quantity }
              },
              data: {
                stockOnHand: { decrement: item.quantity }
              }
            });

            if (updated.count === 0) {
              const product = await tx.product.findFirst({
                where: {
                  id: item.productId,
                  storeId: payload.storeId
                },
                select: {
                  name: true,
                  isActive: true
                }
              });

              if (!product || !product.isActive) {
                throw new Error(`${PRODUCT_NOT_FOUND_PREFIX}${item.productId}`);
              }

              throw new Error(`${INSUFFICIENT_STOCK_PREFIX}${product.name}`);
            }

            await tx.stockMovement.create({
              data: {
                storeId: payload.storeId,
                productId: item.productId,
                type: "sale",
                quantity: item.quantity,
                reason: "offline_sync_sale"
              }
            });
          }

          const sale = await tx.sale.create({
            data: {
              tenantId: auth.tenantId,
              storeId: payload.storeId,
              cashierUserId: auth.userId,
              idempotencyKey: payload.idempotencyKey,
              paymentMethod: paymentInfo.paymentMethod,
              paymentDetails: paymentInfo.paymentDetails
                ? (paymentInfo.paymentDetails as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              referenceNumber: paymentInfo.referenceNumber,
              paidAmount: paymentInfo.paidAmount,
              changeAmount: paymentInfo.changeAmount,
              subtotal,
              discount: payload.discount,
              promoCode: promoResult.promoCode,
              promoDiscount: promoResult.promoDiscount,
              total,
              soldAt: new Date(payload.soldAt),
              items: {
                createMany: {
                  data: itemTotals.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discount: item.lineDiscount,
                    lineTotal: item.lineTotal
                  }))
                }
              }
            }
          });

          return sale;
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(PRODUCT_NOT_FOUND_PREFIX)) {
          return reply.status(404).send({ message: "Product not found" });
        }

        if (error instanceof Error && error.message.startsWith(INSUFFICIENT_STOCK_PREFIX)) {
          const productName = error.message.slice(INSUFFICIENT_STOCK_PREFIX.length);
          return reply.status(400).send({ message: `Insufficient stock for product ${productName}` });
        }

        throw error;
      }

      return {
        status: "synced",
        saleId: result.id,
        total
      };
    }
  );
}
