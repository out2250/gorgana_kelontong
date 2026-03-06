import { FastifyInstance } from "fastify";
import { z } from "zod";

import { isDateInClosedPeriod } from "../lib/finance-period";
import { addFifoLayer } from "../lib/inventory-costing";
import { prisma } from "../lib/prisma";
import { getTenantFinanceSettings } from "../lib/tenant-finance-settings";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const ListPurchaseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  storeId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional()
});

const CreatePurchaseSchema = z.object({
  storeId: z.string().uuid(),
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  receiveNow: z.boolean().default(true),
  purchasedAt: z.string().datetime(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      unitCost: z.number().positive()
    })
  ).min(1)
});

const ReceivePurchaseParamsSchema = z.object({
  id: z.string().uuid()
});

const ReceivePurchaseSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive()
    })
  ).min(1)
});

function buildReceivedQtyByProduct(
  movements: Array<{ productId: string; quantity: number; reason: string | null | undefined }>
) {
  const receivedQtyByProduct = new Map<string, number>();

  for (const movement of movements) {
    if (!movement.reason) {
      continue;
    }

    const isAutoReceive = movement.reason.startsWith("purchase_restock:");
    const isPartialReceive = movement.reason.startsWith("purchase_receive_item:");

    if (!isAutoReceive && !isPartialReceive) {
      continue;
    }

    receivedQtyByProduct.set(
      movement.productId,
      (receivedQtyByProduct.get(movement.productId) ?? 0) + Number(movement.quantity)
    );
  }

  return receivedQtyByProduct;
}

export async function purchaseRoutes(app: FastifyInstance) {
  app.get(
    "/purchases",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = ListPurchaseQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, startDate, endDate, search } = parsed.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(storeId ? { storeId } : {}),
        ...(startDate || endDate
          ? {
              purchasedAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {})
              }
            }
          : {}),
        ...(search
          ? {
              OR: [
                { supplier: { name: { contains: search, mode: "insensitive" as const } } },
                { invoiceNumber: { contains: search, mode: "insensitive" as const } }
              ]
            }
          : {})
      };

      const [total, items] = await Promise.all([
        prisma.purchase.count({ where }),
        prisma.purchase.findMany({
          where,
          include: {
            store: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true, email: true } },
            supplier: { select: { id: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true } }
              }
            }
          },
          orderBy: { purchasedAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      const purchaseIds = items.map((item) => item.id);
      const receivedMovements = purchaseIds.length > 0
        ? await prisma.stockMovement.findMany({
          where: {
            referenceId: { in: purchaseIds },
            type: "in"
          },
          select: {
            referenceId: true,
            productId: true,
            quantity: true,
            reason: true
          }
        })
        : [];

      const receivedByPurchase = new Map<string, Map<string, number>>();
      for (const movement of receivedMovements) {
        if (!movement.referenceId) {
          continue;
        }

        const map = receivedByPurchase.get(movement.referenceId) ?? new Map<string, number>();
        if (movement.reason?.startsWith("purchase_restock:") || movement.reason?.startsWith("purchase_receive_item:")) {
          map.set(movement.productId, (map.get(movement.productId) ?? 0) + Number(movement.quantity));
        }
        receivedByPurchase.set(movement.referenceId, map);
      }

      return {
        items: items.map((item) => ({
          ...item,
          supplierName: item.supplier.name,
          items: item.items.map((purchaseItem) => {
            const receivedQty = receivedByPurchase.get(item.id)?.get(purchaseItem.productId) ?? 0;
            const remainingQty = Math.max(Number(purchaseItem.quantity) - receivedQty, 0);

            return {
              ...purchaseItem,
              receivedQuantity: receivedQty,
              remainingQuantity: remainingQty
            };
          })
        })),
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
    "/purchases",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("purchase.create")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreatePurchaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;

      const store = await prisma.store.findFirst({
        where: {
          id: payload.storeId,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          isActive: true
        }
      });

      if (!store) {
        return reply.status(403).send({ message: "Store access denied" });
      }

      const supplier = await prisma.supplier.findFirst({
        where: {
          id: payload.supplierId,
          tenantId: store.tenantId,
          isActive: true
        },
        select: {
          id: true,
          name: true
        }
      });

      if (!supplier) {
        return reply.status(422).send({ message: "Supplier tidak valid" });
      }

      const financeSettings = await getTenantFinanceSettings(store.tenantId);
      if (isDateInClosedPeriod(payload.purchasedAt, financeSettings.closedThroughAt)) {
        return reply.status(423).send({ message: "Periode sudah ditutup, pembelian tidak dapat dibuat" });
      }

      const productIds = [...new Set(payload.items.map((item) => item.productId))];
      const validProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          storeId: payload.storeId,
          isActive: true
        },
        select: { id: true }
      });

      if (validProducts.length !== productIds.length) {
        return reply.status(400).send({ message: "Ada produk yang tidak valid untuk store ini" });
      }

      let purchase;
      try {
        purchase = await prisma.$transaction(async (tx: any) => {
        const created = await tx.purchase.create({
          data: {
            tenantId: store.tenantId,
            storeId: payload.storeId,
            createdBy: auth.userId,
            supplierId: supplier.id,
            invoiceNumber: payload.invoiceNumber,
            notes: payload.notes,
            purchasedAt: new Date(payload.purchasedAt),
            items: {
              createMany: {
                data: payload.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitCost: item.unitCost,
                  lineTotal: item.quantity * item.unitCost
                }))
              }
            }
          },
          include: {
            items: true
          }
        });

        if (payload.receiveNow) {
          for (const item of payload.items) {
          const currentProduct = await tx.product.findFirst({
            where: {
              id: item.productId,
              storeId: payload.storeId,
              isActive: true
            },
            select: {
              stockOnHand: true,
              costPrice: true
            }
          });

          if (!currentProduct) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          const currentStock = Number(currentProduct.stockOnHand ?? 0);
          const currentCost = Number(currentProduct.costPrice ?? item.unitCost);
          const incomingStock = Number(item.quantity);
          const nextStock = currentStock + incomingStock;
          const weightedAverageCost = nextStock > 0
            ? ((currentCost * currentStock) + (item.unitCost * incomingStock)) / nextStock
            : item.unitCost;

          await tx.product.updateMany({
            where: {
              id: item.productId,
              storeId: payload.storeId,
              isActive: true
            },
            data: {
              stockOnHand: { increment: item.quantity },
              costPrice: weightedAverageCost
            }
          });

          await tx.stockMovement.create({
            data: {
              storeId: payload.storeId,
              productId: item.productId,
              type: "in",
              quantity: item.quantity,
              reason: `purchase_restock:${supplier.name}`,
              referenceId: created.id
            }
          });

            await addFifoLayer(
              store.tenantId,
              {
                storeId: payload.storeId,
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                receivedAt: payload.purchasedAt,
                purchaseId: created.id
              },
              undefined,
              tx
            );
        }
        }

        return created;
      });
      } catch (error) {
        if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
          return reply.status(404).send({ message: "Product not found in this store" });
        }
        throw error;
      }

      return reply.status(201).send(purchase);
    }
  );

  app.post(
    "/purchases/:id/receive",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("purchase.receive")
      ]
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = ReceivePurchaseParamsSchema.safeParse(request.params);
      const parsed = ReceivePurchaseSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const purchase = await prisma.purchase.findFirst({
        where: {
          id: params.data.id,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
        },
        include: {
          items: true,
          supplier: { select: { name: true } }
        }
      });

      if (!purchase) {
        return reply.status(404).send({ message: "Purchase not found" });
      }

      const hasStore = await prisma.store.findFirst({
        where: {
          id: purchase.storeId,
          ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId }),
          isActive: true
        },
        select: { id: true, tenantId: true }
      });

      if (!hasStore) {
        return reply.status(403).send({ message: "Store access denied" });
      }

      const nowIso = new Date().toISOString();
      const financeSettings = await getTenantFinanceSettings(hasStore.tenantId);
      if (isDateInClosedPeriod(nowIso, financeSettings.closedThroughAt)) {
        return reply.status(423).send({ message: "Periode sudah ditutup, penerimaan tidak dapat dibuat" });
      }

      const currentReceipts = await prisma.stockMovement.findMany({
        where: {
          referenceId: purchase.id,
          type: "in"
        },
        select: {
          productId: true,
          quantity: true,
          reason: true
        }
      });

      const receivedQtyByProduct = buildReceivedQtyByProduct(currentReceipts);
      const purchaseItemByProduct = new Map(purchase.items.map((item) => [item.productId, item]));

      for (const item of parsed.data.items) {
        const purchaseItem = purchaseItemByProduct.get(item.productId);
        if (!purchaseItem) {
          return reply.status(400).send({ message: "Produk tidak ada di purchase ini" });
        }

        const receivedQty = receivedQtyByProduct.get(item.productId) ?? 0;
        const remainingQty = Math.max(Number(purchaseItem.quantity) - receivedQty, 0);

        if (item.quantity > remainingQty) {
          return reply.status(400).send({ message: "Qty terima melebihi sisa qty purchase" });
        }
      }

      try {
        await prisma.$transaction(async (tx: any) => {
          for (const item of parsed.data.items) {
            const purchaseItem = purchaseItemByProduct.get(item.productId);
            if (!purchaseItem) {
              throw new Error("PURCHASE_ITEM_NOT_FOUND");
            }

            const currentProduct = await tx.product.findFirst({
              where: {
                id: item.productId,
                storeId: purchase.storeId,
                isActive: true
              },
              select: {
                stockOnHand: true,
                costPrice: true
              }
            });

            if (!currentProduct) {
              throw new Error("PRODUCT_NOT_FOUND");
            }

            const currentStock = Number(currentProduct.stockOnHand ?? 0);
            const currentCost = Number(currentProduct.costPrice ?? purchaseItem.unitCost);
            const incomingStock = Number(item.quantity);
            const unitCost = Number(purchaseItem.unitCost);
            const nextStock = currentStock + incomingStock;
            const weightedAverageCost = nextStock > 0
              ? ((currentCost * currentStock) + (unitCost * incomingStock)) / nextStock
              : unitCost;

            await tx.product.updateMany({
              where: {
                id: item.productId,
                storeId: purchase.storeId,
                isActive: true
              },
              data: {
                stockOnHand: { increment: incomingStock },
                costPrice: weightedAverageCost
              }
            });

            await tx.stockMovement.create({
              data: {
                storeId: purchase.storeId,
                productId: item.productId,
                type: "in",
                quantity: incomingStock,
                reason: `purchase_receive_item:${purchase.id}:${item.productId}`,
                referenceId: purchase.id
              }
            });

            await addFifoLayer(
              purchase.tenantId,
              {
                storeId: purchase.storeId,
                productId: item.productId,
                quantity: incomingStock,
                unitCost,
                purchaseId: purchase.id
              },
              undefined,
              tx
            );
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
          return reply.status(404).send({ message: "Product not found in this store" });
        }
        if (error instanceof Error && error.message === "PURCHASE_ITEM_NOT_FOUND") {
          return reply.status(400).send({ message: "Produk tidak ada di purchase ini" });
        }
        throw error;
      }

      const updatedReceipts = await prisma.stockMovement.findMany({
        where: {
          referenceId: purchase.id,
          type: "in"
        },
        select: {
          productId: true,
          quantity: true,
          reason: true
        }
      });

      const updatedReceivedMap = buildReceivedQtyByProduct(updatedReceipts);

      return {
        status: "received",
        purchaseId: purchase.id,
        items: purchase.items.map((item) => {
          const receivedQuantity = updatedReceivedMap.get(item.productId) ?? 0;
          const remainingQuantity = Math.max(Number(item.quantity) - receivedQuantity, 0);
          return {
            productId: item.productId,
            orderedQuantity: Number(item.quantity),
            receivedQuantity,
            remainingQuantity
          };
        })
      };
    }
  );
}
