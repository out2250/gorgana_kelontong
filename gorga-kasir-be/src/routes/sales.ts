import { randomUUID } from "crypto";

import { FastifyInstance } from "fastify";
import { z } from "zod";

import { isDateInClosedPeriod } from "../lib/finance-period";
import { consumeFifoLayers } from "../lib/inventory-costing";
import { prisma } from "../lib/prisma";
import { getTenantFinanceSettings } from "../lib/tenant-finance-settings";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const PRODUCT_NOT_FOUND_PREFIX = "PRODUCT_NOT_FOUND:";
const INSUFFICIENT_STOCK_PREFIX = "INSUFFICIENT_STOCK:";

const PaymentBreakdownSchema = z.object({
  cash: z.number().nonnegative().default(0),
  qris: z.number().nonnegative().default(0),
  transfer: z.number().nonnegative().default(0)
});

const CreateSaleSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  storeId: z.string().uuid(),
  paymentMethod: z.string().min(1),
  paymentBreakdown: PaymentBreakdownSchema.optional(),
  referenceNumber: z.string().max(100).optional(),
  paidAmount: z.number().nonnegative().optional(),
  soldAt: z.string().datetime(),
  promoCode: z.string().max(50).optional(),
  discount: z.number().nonnegative().default(0),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
      discount: z.number().nonnegative().default(0)
    })
  ).min(1)
});

const ListSalesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  storeId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

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
      && typeof (promo as PromoRecord).code === "string"
      && typeof (promo as PromoRecord).discountPercent === "number"
      && typeof (promo as PromoRecord).startAt === "string"
      && typeof (promo as PromoRecord).endAt === "string"
      && typeof (promo as PromoRecord).isActive === "boolean"
    );
  });
}

function calculatePromoDiscount(
  subtotal: number,
  soldAtIso: string,
  promoCode: string | undefined,
  lineItems: Array<{ category: string | null; lineTotal: number }>,
  promos: PromoRecord[]
) {
  if (!promoCode) {
    return { promoCode: null, promoDiscount: 0 };
  }

  const promo = promos.find((item) => item.code.toUpperCase() === promoCode.toUpperCase());
  if (!promo) {
    throw new Error("INVALID_PROMO_CODE");
  }

  if (!promo.isActive) {
    throw new Error("PROMO_NOT_ACTIVE");
  }

  const soldAtMs = new Date(soldAtIso).getTime();
  const startAtMs = new Date(promo.startAt).getTime();
  const endAtMs = new Date(promo.endAt).getTime();
  if (soldAtMs < startAtMs || soldAtMs > endAtMs) {
    throw new Error("PROMO_NOT_ACTIVE");
  }

  const eligibleSubtotal = promo.category
    ? lineItems
        .filter((item) => item.category === promo.category)
        .reduce((acc, item) => acc + item.lineTotal, 0)
    : subtotal;

  if (eligibleSubtotal <= 0) {
    throw new Error("PROMO_NOT_ACTIVE");
  }

  const promoDiscount = Math.floor((eligibleSubtotal * promo.discountPercent) / 100);
  return { promoCode: promoCode.toUpperCase(), promoDiscount };
}

function resolvePayment(payload: z.infer<typeof CreateSaleSchema>, total: number) {
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

const ReturnSaleParamsSchema = z.object({
  id: z.string().uuid()
});

const ReturnSaleBodySchema = z.object({
  reason: z.string().min(3).max(200).optional()
});

const ReturnPartialSaleBodySchema = z.object({
  reason: z.string().min(3).max(200).optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive()
    })
  ).min(1)
});

export async function salesRoutes(app: FastifyInstance) {
  app.get(
    "/sales",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ListSalesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, startDate, endDate } = parsed.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(storeId ? { storeId } : {}),
        ...(startDate || endDate
          ? {
              soldAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {})
              }
            }
          : {})
      };

      const [total, sales] = await Promise.all([
        prisma.sale.count({ where }),
        prisma.sale.findMany({
          where,
          include: {
            store: {
              select: { id: true, name: true }
            },
            cashier: {
              select: { id: true, fullName: true, email: true }
            }
          },
          orderBy: { soldAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: sales,
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
    "/sales",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager", "cashier"),
        requirePermission("sales.create")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateSaleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = {
        ...parsed.data,
        idempotencyKey: parsed.data.idempotencyKey ?? randomUUID()
      };

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

      let storeTenantId = hasStoreAccess?.store.tenantId;
      let storeIsActive = Boolean(hasStoreAccess?.store.isActive);

      if (auth.isSuperAdmin && (!storeTenantId || !storeIsActive)) {
        const targetStore = await prisma.store.findUnique({
          where: { id: payload.storeId },
          select: { tenantId: true, isActive: true }
        });

        storeTenantId = targetStore?.tenantId;
        storeIsActive = Boolean(targetStore?.isActive);
      }

      if (!storeTenantId || !storeIsActive) {
        return reply.status(403).send({ message: "No store access" });
      }

      if (!auth.isSuperAdmin && (!hasStoreAccess || hasStoreAccess.store.tenantId !== auth.tenantId || !hasStoreAccess.store.isActive)) {
        return reply.status(403).send({ message: "No store access" });
      }

      const financeSettings = await getTenantFinanceSettings(storeTenantId);
      if (isDateInClosedPeriod(payload.soldAt, financeSettings.closedThroughAt)) {
        return reply.status(423).send({ message: "Periode sudah ditutup, transaksi tidak dapat dibuat" });
      }

      const existing = await prisma.sale.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: storeTenantId,
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

      const productRefs = await prisma.product.findMany({
        where: {
          id: {
            in: itemTotals.map((item) => item.productId)
          },
          storeId: payload.storeId
        },
        select: {
          id: true,
          category: true,
          costPrice: true
        }
      });

      if (productRefs.length !== itemTotals.length) {
        return reply.status(404).send({ message: "Product not found" });
      }

      const lineItemsForPromo = itemTotals.map((item) => {
        const ref = productRefs.find((product) => product.id === item.productId);
        return {
          category: ref?.category ?? null,
          lineTotal: item.lineTotal
        };
      });

      const subtotal = itemTotals.reduce((acc, item) => acc + item.lineTotal, 0);

      const tenant = await prisma.tenant.findUnique({
        where: { id: storeTenantId },
        select: { additionalData: true }
      });

      const promos = readPromosFromAdditionalData(tenant?.additionalData);

      let promoResult;
      try {
        promoResult = calculatePromoDiscount(subtotal, payload.soldAt, payload.promoCode, lineItemsForPromo, promos);
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

      let sale;
      try {
        sale = await prisma.$transaction(async (tx: any) => {
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
                  isActive: true,
                  stockOnHand: true
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
                reason: "sale_transaction"
              }
            });

            await consumeFifoLayers(
              storeTenantId,
              {
                storeId: payload.storeId,
                productId: item.productId,
                quantity: item.quantity
              },
              undefined,
              tx
            );
          }

          return tx.sale.create({
            data: {
              tenantId: storeTenantId,
              storeId: payload.storeId,
              cashierUserId: auth.userId,
              idempotencyKey: payload.idempotencyKey,
              paymentMethod: paymentInfo.paymentMethod,
              paymentDetails: paymentInfo.paymentDetails ?? null,
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

      return reply.status(201).send({
        status: "created",
        saleId: sale.id,
        total
      });
    }
  );

  app.get(
    "/sales/:id",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsedParams = ReturnSaleParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const sale = await prisma.sale.findFirst({
        where: {
          id: parsedParams.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        include: {
          store: { select: { id: true, name: true } },
          cashier: { select: { id: true, fullName: true, email: true } },
          items: {
            include: {
              product: {
                select: { id: true, sku: true, name: true }
              }
            }
          }
        }
      });

      if (!sale) {
        return reply.status(404).send({ message: "Sale not found" });
      }

      return sale;
    }
  );

  app.post(
    "/sales/:id/return",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager", "cashier"),
        requirePermission("sales.return")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsedParams = ReturnSaleParamsSchema.safeParse(request.params);
      const parsedBody = ReturnSaleBodySchema.safeParse(request.body ?? {});
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const sale = await prisma.sale.findFirst({
        where: {
          id: parsedParams.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        include: {
          items: true,
          store: {
            select: {
              id: true,
              tenantId: true,
              isActive: true
            }
          }
        }
      });

      if (!sale) {
        return reply.status(404).send({ message: "Sale not found" });
      }

      if (!auth.isSuperAdmin) {
        const hasAccess = await prisma.userStoreAccess.findUnique({
          where: {
            userId_storeId: {
              userId: auth.userId,
              storeId: sale.storeId
            }
          }
        });

        if (!hasAccess || sale.store.tenantId !== auth.tenantId || !sale.store.isActive) {
          return reply.status(403).send({ message: "No store access" });
        }
      }

      const returnMovements = await prisma.stockMovement.findMany({
        where: {
          storeId: sale.storeId,
          referenceId: sale.id,
          type: "in",
          reason: { startsWith: "sale_return_item:" }
        },
        select: {
          productId: true,
          quantity: true
        }
      });

      const returnedQtyByProduct = new Map<string, number>();
      for (const movement of returnMovements) {
        returnedQtyByProduct.set(
          movement.productId,
          (returnedQtyByProduct.get(movement.productId) ?? 0) + movement.quantity
        );
      }

      const returnableItems = sale.items
        .map((item: { productId: string; quantity: number }) => {
          const alreadyReturned = returnedQtyByProduct.get(item.productId) ?? 0;
          const remaining = Math.max(item.quantity - alreadyReturned, 0);
          return {
            productId: item.productId,
            remaining
          };
        })
        .filter((item: { productId: string; remaining: number }) => item.remaining > 0);

      if (returnableItems.length === 0) {
        return reply.status(409).send({ message: "Sale already fully returned" });
      }

      await prisma.$transaction(async (tx: any) => {
        for (const item of returnableItems) {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              storeId: sale.storeId,
              isActive: true
            },
            data: {
              stockOnHand: { increment: item.remaining }
            }
          });

          await tx.stockMovement.create({
            data: {
              storeId: sale.storeId,
              productId: item.productId,
              type: "in",
              quantity: item.remaining,
              reason: parsedBody.data.reason
                ? `sale_return_item:${item.productId}:${parsedBody.data.reason}`
                : `sale_return_item:${item.productId}`,
              referenceId: sale.id
            }
          });
        }
      });

      return {
        status: "returned",
        saleId: sale.id,
        returnedItems: returnableItems.length
      };
    }
  );

  app.post(
    "/sales/:id/return-partial",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager", "cashier"),
        requirePermission("sales.return")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsedParams = ReturnSaleParamsSchema.safeParse(request.params);
      const parsedBody = ReturnPartialSaleBodySchema.safeParse(request.body ?? {});
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const sale = await prisma.sale.findFirst({
        where: {
          id: parsedParams.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        include: {
          items: true,
          store: {
            select: {
              id: true,
              tenantId: true,
              isActive: true
            }
          }
        }
      });

      if (!sale) {
        return reply.status(404).send({ message: "Sale not found" });
      }

      if (!auth.isSuperAdmin) {
        const hasAccess = await prisma.userStoreAccess.findUnique({
          where: {
            userId_storeId: {
              userId: auth.userId,
              storeId: sale.storeId
            }
          }
        });

        if (!hasAccess || sale.store.tenantId !== auth.tenantId || !sale.store.isActive) {
          return reply.status(403).send({ message: "No store access" });
        }
      }

      const returnMovements = await prisma.stockMovement.findMany({
        where: {
          storeId: sale.storeId,
          referenceId: sale.id,
          type: "in",
          reason: { startsWith: "sale_return_item:" }
        },
        select: {
          productId: true,
          quantity: true
        }
      });

      const returnedQtyByProduct = new Map<string, number>();
      for (const movement of returnMovements) {
        returnedQtyByProduct.set(
          movement.productId,
          (returnedQtyByProduct.get(movement.productId) ?? 0) + movement.quantity
        );
      }

      const saleQtyByProduct = new Map<string, number>();
      for (const item of sale.items) {
        saleQtyByProduct.set(item.productId, item.quantity);
      }

      for (const item of parsedBody.data.items) {
        const soldQty = saleQtyByProduct.get(item.productId);
        if (!soldQty) {
          return reply.status(400).send({ message: "Produk tidak ada di transaksi ini" });
        }

        const alreadyReturned = returnedQtyByProduct.get(item.productId) ?? 0;
        const remaining = Math.max(soldQty - alreadyReturned, 0);
        if (item.quantity > remaining) {
          return reply.status(400).send({ message: "Qty retur melebihi sisa qty yang bisa diretur" });
        }
      }

      await prisma.$transaction(async (tx: any) => {
        for (const item of parsedBody.data.items) {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              storeId: sale.storeId,
              isActive: true
            },
            data: {
              stockOnHand: { increment: item.quantity }
            }
          });

          await tx.stockMovement.create({
            data: {
              storeId: sale.storeId,
              productId: item.productId,
              type: "in",
              quantity: item.quantity,
              reason: parsedBody.data.reason
                ? `sale_return_item:${item.productId}:${parsedBody.data.reason}`
                : `sale_return_item:${item.productId}`,
              referenceId: sale.id
            }
          });
        }
      });

      return {
        status: "partial_returned",
        saleId: sale.id,
        returnedItems: parsedBody.data.items.length
      };
    }
  );
}
