import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const CreateProductSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(2),
  barcode: z.string().min(3).max(64).optional(),
  category: z.enum(["cair", "padat"]).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  supplierPrice: z.number().positive().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  unitMeasure: z.enum(["mL", "L", "mG", "KG"]).default("mL"),
  unitValue: z.number().positive().default(1),
  sellCategories: z.array(z.string().min(1)).min(1).default(["pcs"]),
  costPrice: z.number().positive().optional(),
  sellPrice: z.number().positive(),
  minimumStock: z.number().int().min(0).default(0),
  stockOnHand: z.number().int().min(0).default(0)
});

const UpdateProductAdjustmentSchema = z.object({
  barcode: z.string().min(3).max(64).optional(),
  sellPrice: z.number().positive().optional(),
  minimumStock: z.number().int().min(0).optional(),
  stockOnHand: z.number().int().min(0).optional(),
  category: z.enum(["cair", "padat"]).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  unitMeasure: z.enum(["mL", "L", "mG", "KG"]).optional(),
  unitValue: z.number().positive().optional(),
  sellCategories: z.array(z.string().min(1)).min(1).optional()
});

const MoveStockSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.enum(["in", "out", "adjustment"]),
  quantity: z.number().int().positive(),
  reason: z.string().optional()
});

const ListProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  storeId: z.string().uuid().optional(),
  search: z.string().optional(),
  category: z.enum(["cair", "padat"]).optional()
});

const SKU_STORE_CODE_LENGTH = 6;
const SKU_SERIAL_LENGTH = 6;

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildNextSku(storeId: string) {
  const normalizedStoreId = storeId.replace(/-/g, "").toUpperCase();
  const storeCode = normalizedStoreId.slice(-SKU_STORE_CODE_LENGTH).padStart(SKU_STORE_CODE_LENGTH, "0");
  const prefix = `SKU-${storeCode}-`;

  const latest = await prisma.product.findFirst({
    where: {
      storeId,
      sku: {
        startsWith: prefix
      }
    },
    orderBy: {
      sku: "desc"
    },
    select: {
      sku: true
    }
  });

  const pattern = new RegExp(`^${escapeRegex(prefix)}(\\d{${SKU_SERIAL_LENGTH}})$`);
  const latestSerial = latest?.sku.match(pattern)?.[1];
  const nextSerial = (latestSerial ? Number(latestSerial) : 0) + 1;

  return `${prefix}${String(nextSerial).padStart(SKU_SERIAL_LENGTH, "0")}`;
}

export async function inventoryRoutes(app: FastifyInstance) {
  app.get(
    "/products",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const tenantId = auth.tenantId;

      const query = ListProductQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, search, category } = query.data;
      const skip = (page - 1) * pageSize;

      if (storeId && !auth.isSuperAdmin) {
        const access = await prisma.userStoreAccess.findUnique({
          where: {
            userId_storeId: {
              userId: auth.userId,
              storeId
            }
          }
        });

        const store = await prisma.store.findFirst({
          where: {
            id: storeId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!access || !store) {
          return reply.status(403).send({ message: "No store access" });
        }
      }

      const where = {
        store: {
          ...(request.auth?.isSuperAdmin ? {} : { tenantId }),
          ...(storeId ? { id: storeId } : {})
        },
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { sku: { contains: search, mode: "insensitive" as const } },
                { barcode: { contains: search, mode: "insensitive" as const } }
              ]
            }
          : {})
      };

      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: {
            store: {
              select: { id: true, name: true }
            }
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: products,
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
    "/products",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateProductSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const hasStore = await prisma.store.findFirst({
        where: {
          id: parsed.data.storeId,
          ...(request.auth?.isSuperAdmin ? {} : { tenantId })
        }
      });

      if (!hasStore) {
        return reply.status(403).send({ message: "Store access denied" });
      }

      const normalizedName = parsed.data.name.trim().toUpperCase();
      const normalizedBarcode = parsed.data.barcode?.trim() || null;

      if (parsed.data.categoryId) {
        const category = await prisma.category.findFirst({
          where: {
            id: parsed.data.categoryId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!category) {
          return reply.status(422).send({ message: "Kategori produk tidak valid" });
        }
      }

      if (parsed.data.brandId) {
        const brand = await prisma.brand.findFirst({
          where: {
            id: parsed.data.brandId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!brand) {
          return reply.status(422).send({ message: "Brand produk tidak valid" });
        }
      }

      if (parsed.data.supplierId) {
        const supplier = await prisma.supplier.findFirst({
          where: {
            id: parsed.data.supplierId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!supplier) {
          return reply.status(422).send({ message: "Supplier tidak valid" });
        }
      }

      const duplicateName = await prisma.product.findFirst({
        where: {
          storeId: parsed.data.storeId,
          name: {
            equals: normalizedName
          }
        },
        select: { id: true }
      });

      if (duplicateName) {
        return reply.status(409).send({ message: "Nama produk sudah digunakan di store ini" });
      }

      let product = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const generatedSku = await buildNextSku(parsed.data.storeId);

        try {
          product = await prisma.$transaction(async (tx: any) => {
            const created = await tx.product.create({
              data: {
                storeId: parsed.data.storeId,
                sku: generatedSku,
                barcode: normalizedBarcode,
                name: normalizedName,
                category: parsed.data.category,
                categoryId: parsed.data.categoryId ?? null,
                brandId: parsed.data.brandId ?? null,
                unitMeasure: parsed.data.unitMeasure,
                unitValue: parsed.data.unitValue,
                sellCategories: parsed.data.sellCategories,
                costPrice: parsed.data.costPrice ?? null,
                sellPrice: parsed.data.sellPrice,
                minimumStock: parsed.data.minimumStock,
                stockOnHand: parsed.data.stockOnHand
              }
            });

            if (parsed.data.supplierId) {
              await tx.productSupplier.upsert({
                where: {
                  productId_supplierId: {
                    productId: created.id,
                    supplierId: parsed.data.supplierId
                  }
                },
                create: {
                  productId: created.id,
                  supplierId: parsed.data.supplierId,
                  supplierPrice: parsed.data.supplierPrice,
                  leadTimeDays: parsed.data.leadTimeDays,
                  isPrimary: true
                },
                update: {
                  supplierPrice: parsed.data.supplierPrice,
                  leadTimeDays: parsed.data.leadTimeDays,
                  isPrimary: true
                }
              });
            }

            return created;
          });
          break;
        } catch (error) {
          if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
            continue;
          }
          throw error;
        }
      }

      if (!product) {
        return reply.status(409).send({ message: "Gagal generate SKU unik, coba lagi" });
      }

      await writeAuditLog({
        request,
        tenantId,
        action: "inventory.product.create",
        entityType: "product",
        entityId: product.id,
        afterData: {
          storeId: product.storeId,
          sku: product.sku,
          name: product.name,
          sellPrice: product.sellPrice,
          minimumStock: product.minimumStock,
          stockOnHand: product.stockOnHand
        }
      });

      return reply.status(201).send(product);
    }
  );

  app.patch(
    "/products/:id/adjustment",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = UpdateProductAdjustmentSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;
      if (
        typeof payload.sellPrice !== "number"
        && typeof payload.minimumStock !== "number"
        && typeof payload.stockOnHand !== "number"
        && typeof payload.category !== "string"
        && typeof payload.unitMeasure !== "string"
        && typeof payload.unitValue !== "number"
        && !Array.isArray(payload.sellCategories)
      ) {
        return reply.status(422).send({ message: "Minimal satu field adjustment harus diisi" });
      }

      const product = await prisma.product.findFirst({
        where: {
          id: params.data.id,
          store: {
            ...(request.auth?.isSuperAdmin ? {} : { tenantId })
          }
        }
      });

      if (!product) {
        return reply.status(404).send({ message: "Product not found" });
      }

      if (typeof payload.categoryId === "string") {
        const category = await prisma.category.findFirst({
          where: {
            id: payload.categoryId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!category) {
          return reply.status(422).send({ message: "Kategori produk tidak valid" });
        }
      }

      if (typeof payload.brandId === "string") {
        const brand = await prisma.brand.findFirst({
          where: {
            id: payload.brandId,
            tenantId,
            isActive: true
          },
          select: { id: true }
        });

        if (!brand) {
          return reply.status(422).send({ message: "Brand produk tidak valid" });
        }
      }

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: {
          ...(typeof payload.barcode === "string" ? { barcode: payload.barcode.trim() || null } : {}),
          ...(typeof payload.sellPrice === "number" ? { sellPrice: payload.sellPrice } : {}),
          ...(typeof payload.minimumStock === "number" ? { minimumStock: payload.minimumStock } : {}),
          ...(typeof payload.stockOnHand === "number" ? { stockOnHand: payload.stockOnHand } : {}),
          ...(typeof payload.category === "string" ? { category: payload.category } : {}),
          ...(typeof payload.categoryId === "string" ? { categoryId: payload.categoryId } : {}),
          ...(typeof payload.brandId === "string" ? { brandId: payload.brandId } : {}),
          ...(typeof payload.unitMeasure === "string" ? { unitMeasure: payload.unitMeasure } : {}),
          ...(typeof payload.unitValue === "number" ? { unitValue: payload.unitValue } : {}),
          ...(Array.isArray(payload.sellCategories) ? { sellCategories: payload.sellCategories } : {})
        }
      });

      await writeAuditLog({
        request,
        tenantId,
        action: "inventory.product.adjustment",
        entityType: "product",
        entityId: updated.id,
        beforeData: {
          barcode: product.barcode,
          sellPrice: product.sellPrice,
          minimumStock: product.minimumStock,
          stockOnHand: product.stockOnHand,
          category: product.category,
          categoryId: product.categoryId,
          brandId: product.brandId,
          unitMeasure: product.unitMeasure,
          unitValue: product.unitValue,
          sellCategories: product.sellCategories
        },
        afterData: {
          barcode: updated.barcode,
          sellPrice: updated.sellPrice,
          minimumStock: updated.minimumStock,
          stockOnHand: updated.stockOnHand,
          category: updated.category,
          categoryId: updated.categoryId,
          brandId: updated.brandId,
          unitMeasure: updated.unitMeasure,
          unitValue: updated.unitValue,
          sellCategories: updated.sellCategories
        }
      });

      return updated;
    }
  );

  app.post(
    "/stock/movements",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = MoveStockSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const payload = parsed.data;

      const product = await prisma.product.findFirst({
        where: {
          id: payload.productId,
          storeId: payload.storeId,
          store: {
            ...(request.auth?.isSuperAdmin ? {} : { tenantId })
          }
        }
      });

      if (!product) {
        return reply.status(404).send({ message: "Product not found" });
      }

      let movement;
      let stockOnHand = product.stockOnHand;
      try {
        const result = await prisma.$transaction(async (tx: any) => {
          if (payload.type === "in") {
            await tx.product.updateMany({
              where: { id: product.id },
              data: { stockOnHand: { increment: payload.quantity } }
            });
          }

          if (payload.type === "out") {
            const updated = await tx.product.updateMany({
              where: {
                id: product.id,
                stockOnHand: {
                  gte: payload.quantity
                }
              },
              data: { stockOnHand: { decrement: payload.quantity } }
            });

            if (updated.count === 0) {
              throw new Error("INSUFFICIENT_STOCK");
            }
          }

          if (payload.type === "adjustment") {
            await tx.product.updateMany({
              where: { id: product.id },
              data: { stockOnHand: payload.quantity }
            });
          }

          const movementCreated = await tx.stockMovement.create({
            data: {
              storeId: payload.storeId,
              productId: payload.productId,
              type: payload.type,
              quantity: payload.quantity,
              reason: payload.reason
            }
          });

          const latestProduct = await tx.product.findUnique({
            where: { id: product.id },
            select: { stockOnHand: true }
          });

          return {
            movementCreated,
            nextStock: latestProduct?.stockOnHand ?? 0
          };
        });

        movement = result.movementCreated;
        stockOnHand = result.nextStock;
      } catch (error) {
        if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
          return reply.status(400).send({ message: "Insufficient stock" });
        }

        throw error;
      }

      await writeAuditLog({
        request,
        tenantId,
        action: "inventory.stock.movement",
        entityType: "stock_movement",
        entityId: movement.id,
        afterData: {
          storeId: payload.storeId,
          productId: payload.productId,
          type: payload.type,
          quantity: payload.quantity,
          reason: payload.reason,
          stockOnHand
        }
      });

      return reply.status(201).send({
        movement,
        stockOnHand
      });
    }
  );
}
