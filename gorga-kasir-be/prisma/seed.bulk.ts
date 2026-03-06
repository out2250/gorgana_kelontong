import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "../src/lib/prisma";

const MAIN_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_PASSWORD = "password123";

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

function toDeterministicUuid(seed: string) {
  const hash = crypto.createHash("md5").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function pickFrom<T>(arr: T[], indexSeed: number): T {
  return arr[indexSeed % arr.length];
}

function toIsoDaysAgo(daysAgo: number, hour = 9) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function readPromotions(additionalData: unknown): PromoRecord[] {
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
      && typeof (promo as PromoRecord).id === "string"
      && typeof (promo as PromoRecord).code === "string"
      && typeof (promo as PromoRecord).name === "string"
      && typeof (promo as PromoRecord).discountPercent === "number"
      && typeof (promo as PromoRecord).startAt === "string"
      && typeof (promo as PromoRecord).endAt === "string"
      && typeof (promo as PromoRecord).isActive === "boolean"
      && typeof (promo as PromoRecord).createdAt === "string"
      && typeof (promo as PromoRecord).updatedAt === "string"
    );
  });
}

async function main() {
  const scale = Math.max(1, Number(process.env.SEED_BULK_SCALE ?? "1"));
  const storeCount = 3 * scale;
  const productsPerStore = 30 * scale;
  const purchasesPerStore = 16 * scale;
  const salesPerStore = 40 * scale;
  const expensesPerStore = 18 * scale;
  const shiftsPerStore = 15 * scale;
  const stockOpnameSessionsPerStore = 8 * scale;
  const ticketsPerStore = 10 * scale;

  const tenant = await prisma.tenant.findUnique({
    where: { id: MAIN_TENANT_ID },
    select: { id: true, additionalData: true }
  });

  if (!tenant) {
    throw new Error("Tenant utama belum ada. Jalankan npm run prisma:seed dulu.");
  }

  const owner = await prisma.user.findUnique({ where: { email: "owner@klontong.local" }, select: { id: true } });
  const managerBase = await prisma.user.findUnique({ where: { email: "manager@klontong.local" }, select: { id: true } });
  const cashierBase = await prisma.user.findUnique({ where: { email: "cashier@klontong.local" }, select: { id: true } });

  if (!owner || !managerBase || !cashierBase) {
    throw new Error("User dasar belum ada. Jalankan npm run prisma:seed dulu.");
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const unitOptions = ["mL", "L", "mG", "KG"];
  const sellCategoriesList = [
    ["pcs"],
    ["botol"],
    ["pack"],
    ["sachet"],
    ["lusin"],
    ["kotak"],
    ["dus"]
  ];
  const productCategories = ["cair", "padat", "Sembako", "Minuman", "Snack", "Bumbu", "Kebutuhan Rumah"];
  const expenseTitles = ["Listrik", "Air", "Internet", "ATK", "Transport", "Kebersihan", "Perbaikan"].map((item) => `${item} Operasional`);
  const ticketTitles = ["Printer kasir error", "Sinkronisasi lambat", "Harga produk tidak update", "Akses user bermasalah", "Data shift tidak muncul"];
  const supplierNames = Array.from({ length: 8 }, (_, idx) => `Supplier Bulk ${idx + 1}`);

  const suppliers = await Promise.all(
    supplierNames.map(async (supplierName) => prisma.supplier.upsert({
      where: { tenantId_name: { tenantId: MAIN_TENANT_ID, name: supplierName } },
      update: {
        isActive: true
      },
      create: {
        id: toDeterministicUuid(`bulk-supplier-${supplierName}`),
        tenantId: MAIN_TENANT_ID,
        name: supplierName,
        isActive: true
      },
      select: { id: true, name: true }
    }))
  );

  const stores: Array<{ id: string; name: string }> = [];
  const managers: string[] = [managerBase.id];
  const cashiers: string[] = [cashierBase.id];

  for (let s = 1; s <= storeCount; s += 1) {
    const storeId = toDeterministicUuid(`bulk-store-${s}`);
    const storeName = `Bulk Store ${String(s).padStart(2, "0")}`;

    const store = await prisma.store.upsert({
      where: { id: storeId },
      update: {
        name: storeName,
        address: `Jl. Dummy No.${s}, Kota Demo`,
        isActive: true
      },
      create: {
        id: storeId,
        tenantId: MAIN_TENANT_ID,
        name: storeName,
        address: `Jl. Dummy No.${s}, Kota Demo`,
        isActive: true
      },
      select: { id: true, name: true }
    });

    stores.push(store);

    await prisma.userStoreAccess.upsert({
      where: { userId_storeId: { userId: owner.id, storeId: store.id } },
      update: {},
      create: { userId: owner.id, storeId: store.id }
    });

    const managerEmail = `manager.bulk.${s}@klontong.local`;
    const managerId = toDeterministicUuid(`bulk-manager-${s}`);
    const manager = await prisma.user.upsert({
      where: { email: managerEmail },
      update: {
        tenantId: MAIN_TENANT_ID,
        username: `manager.bulk.${s}`,
        fullName: `Manager Bulk ${s}`,
        passwordHash,
        role: "manager",
        isActive: true,
        jobResponsibility: "Operasional & Inventory"
      },
      create: {
        id: managerId,
        tenantId: MAIN_TENANT_ID,
        username: `manager.bulk.${s}`,
        fullName: `Manager Bulk ${s}`,
        email: managerEmail,
        passwordHash,
        role: "manager",
        isActive: true,
        jobResponsibility: "Operasional & Inventory"
      },
      select: { id: true }
    });

    managers.push(manager.id);

    await prisma.userStoreAccess.upsert({
      where: { userId_storeId: { userId: manager.id, storeId: store.id } },
      update: {},
      create: { userId: manager.id, storeId: store.id }
    });

    for (let c = 1; c <= 2; c += 1) {
      const cashierEmail = `cashier.bulk.${s}.${c}@klontong.local`;
      const cashierId = toDeterministicUuid(`bulk-cashier-${s}-${c}`);

      const cashier = await prisma.user.upsert({
        where: { email: cashierEmail },
        update: {
          tenantId: MAIN_TENANT_ID,
          username: `cashier.bulk.${s}.${c}`,
          fullName: `Kasir Bulk ${s}-${c}`,
          passwordHash,
          role: "cashier",
          isActive: true,
          jobResponsibility: "Transaksi Kasir"
        },
        create: {
          id: cashierId,
          tenantId: MAIN_TENANT_ID,
          username: `cashier.bulk.${s}.${c}`,
          fullName: `Kasir Bulk ${s}-${c}`,
          email: cashierEmail,
          passwordHash,
          role: "cashier",
          isActive: true,
          jobResponsibility: "Transaksi Kasir"
        },
        select: { id: true }
      });

      cashiers.push(cashier.id);

      await prisma.userStoreAccess.upsert({
        where: { userId_storeId: { userId: cashier.id, storeId: store.id } },
        update: {},
        create: { userId: cashier.id, storeId: store.id }
      });
    }
  }

  const productsByStore = new Map<string, Array<{ id: string; sku: string; sellPrice: number; costPrice: number; name: string }>>();

  for (let s = 0; s < stores.length; s += 1) {
    const store = stores[s];
    const storeProducts: Array<{ id: string; sku: string; sellPrice: number; costPrice: number; name: string }> = [];

    for (let p = 1; p <= productsPerStore; p += 1) {
      const code = store.id.replace(/-/g, "").toUpperCase().slice(-6);
      const sku = `SKU-${code}-${String(p).padStart(6, "0")}`;
      const productId = toDeterministicUuid(`bulk-product-${store.id}-${p}`);
      const costPrice = 2000 + ((p * 113) % 7000);
      const sellPrice = costPrice + 500 + ((p * 37) % 2500);

      await prisma.product.upsert({
        where: { storeId_sku: { storeId: store.id, sku } },
        update: {
          name: `Produk Bulk ${s + 1}-${p}`,
          category: pickFrom(productCategories, p),
          unitMeasure: pickFrom(unitOptions, p),
          unitValue: p % 3 === 0 ? 0.5 : p % 4 === 0 ? 2 : 1,
          sellCategories: pickFrom(sellCategoriesList, p),
          costPrice,
          sellPrice,
          minimumStock: 10 + (p % 20),
          stockOnHand: 80 + ((p * 5) % 120),
          isActive: true
        },
        create: {
          id: productId,
          storeId: store.id,
          sku,
          name: `Produk Bulk ${s + 1}-${p}`,
          category: pickFrom(productCategories, p),
          unitMeasure: pickFrom(unitOptions, p),
          unitValue: p % 3 === 0 ? 0.5 : p % 4 === 0 ? 2 : 1,
          sellCategories: pickFrom(sellCategoriesList, p),
          costPrice,
          sellPrice,
          minimumStock: 10 + (p % 20),
          stockOnHand: 80 + ((p * 5) % 120),
          isActive: true
        }
      });

      const row = await prisma.product.findFirst({
        where: { storeId: store.id, sku },
        select: { id: true, sku: true, sellPrice: true, costPrice: true, name: true }
      });

      if (row) {
        storeProducts.push({
          id: row.id,
          sku: row.sku,
          sellPrice: Number(row.sellPrice),
          costPrice: Number(row.costPrice ?? 0),
          name: row.name
        });
      }
    }

    productsByStore.set(store.id, storeProducts);
  }

  const now = new Date();
  const promoSeeds: PromoRecord[] = [
    {
      id: toDeterministicUuid("bulk-promo-1"),
      code: "BULK10",
      name: "Diskon Umum 10%",
      description: "Promo dummy global untuk testing sales",
      discountPercent: 10,
      category: null,
      startAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      endAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60).toISOString(),
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      id: toDeterministicUuid("bulk-promo-2"),
      code: "CAIR15",
      name: "Promo Kategori Cair",
      description: "Diskon untuk produk kategori cair",
      discountPercent: 15,
      category: "cair",
      startAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      endAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      id: toDeterministicUuid("bulk-promo-3"),
      code: "WEEKEND5",
      name: "Promo Weekend",
      description: "Promo ringan untuk simulasi",
      discountPercent: 5,
      category: null,
      startAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      endAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ];

  const existingPromos = readPromotions(tenant.additionalData);
  const promoMap = new Map<string, PromoRecord>();
  for (const promo of [...promoSeeds, ...existingPromos]) {
    promoMap.set(promo.code.toUpperCase(), promo);
  }

  await prisma.tenant.update({
    where: { id: MAIN_TENANT_ID },
    data: {
      additionalData: {
        ...(tenant.additionalData && typeof tenant.additionalData === "object" ? tenant.additionalData as Record<string, unknown> : {}),
        promotions: Array.from(promoMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }
    }
  });

  for (let s = 0; s < stores.length; s += 1) {
    const store = stores[s];
    const products = productsByStore.get(store.id) ?? [];
    if (products.length === 0) {
      continue;
    }

    const managerId = managers[(s + 1) % managers.length] ?? managerBase.id;
    const cashierId = cashiers[(s + 3) % cashiers.length] ?? cashierBase.id;

    for (let i = 1; i <= purchasesPerStore; i += 1) {
      const purchaseId = toDeterministicUuid(`bulk-purchase-${store.id}-${i}`);
      const productA = pickFrom(products, i);
      const productB = pickFrom(products, i + 7);
      const qtyA = 10 + (i % 20);
      const qtyB = 5 + (i % 10);
      const unitCostA = Math.max(productA.costPrice, 1500);
      const unitCostB = Math.max(productB.costPrice, 1500);
      const purchasedAt = toIsoDaysAgo((i % 45) + 1, 8 + (i % 4));
      const supplier = suppliers[(i - 1) % suppliers.length];

      const purchase = await prisma.purchase.upsert({
        where: { id: purchaseId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          supplierId: supplier.id,
          invoiceNumber: `INV-BULK-${s + 1}-${String(i).padStart(4, "0")}`,
          notes: "Auto seeded bulk purchase",
          purchasedAt
        },
        create: {
          id: purchaseId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          supplierId: supplier.id,
          invoiceNumber: `INV-BULK-${s + 1}-${String(i).padStart(4, "0")}`,
          notes: "Auto seeded bulk purchase",
          purchasedAt
        },
        select: { id: true }
      });

      const itemAId = toDeterministicUuid(`bulk-purchase-item-a-${purchase.id}`);
      const itemBId = toDeterministicUuid(`bulk-purchase-item-b-${purchase.id}`);

      await prisma.purchaseItem.upsert({
        where: { id: itemAId },
        update: { purchaseId: purchase.id, productId: productA.id, quantity: qtyA, unitCost: unitCostA, lineTotal: qtyA * unitCostA },
        create: { id: itemAId, purchaseId: purchase.id, productId: productA.id, quantity: qtyA, unitCost: unitCostA, lineTotal: qtyA * unitCostA }
      });

      await prisma.purchaseItem.upsert({
        where: { id: itemBId },
        update: { purchaseId: purchase.id, productId: productB.id, quantity: qtyB, unitCost: unitCostB, lineTotal: qtyB * unitCostB },
        create: { id: itemBId, purchaseId: purchase.id, productId: productB.id, quantity: qtyB, unitCost: unitCostB, lineTotal: qtyB * unitCostB }
      });

      await prisma.stockMovement.upsert({
        where: { id: toDeterministicUuid(`bulk-stock-in-a-${purchase.id}`) },
        update: { storeId: store.id, productId: productA.id, type: "in", quantity: qtyA, reason: `purchase:${purchase.id}`, referenceId: purchase.id },
        create: {
          id: toDeterministicUuid(`bulk-stock-in-a-${purchase.id}`),
          storeId: store.id,
          productId: productA.id,
          type: "in",
          quantity: qtyA,
          reason: `purchase:${purchase.id}`,
          referenceId: purchase.id
        }
      });

      await prisma.stockMovement.upsert({
        where: { id: toDeterministicUuid(`bulk-stock-in-b-${purchase.id}`) },
        update: { storeId: store.id, productId: productB.id, type: "in", quantity: qtyB, reason: `purchase:${purchase.id}`, referenceId: purchase.id },
        create: {
          id: toDeterministicUuid(`bulk-stock-in-b-${purchase.id}`),
          storeId: store.id,
          productId: productB.id,
          type: "in",
          quantity: qtyB,
          reason: `purchase:${purchase.id}`,
          referenceId: purchase.id
        }
      });
    }

    for (let i = 1; i <= salesPerStore; i += 1) {
      const saleId = toDeterministicUuid(`bulk-sale-${store.id}-${i}`);
      const soldAt = toIsoDaysAgo(i % 30, 9 + (i % 10));
      const itemCount = 1 + (i % 3);
      const method = pickFrom(["cash", "qris", "transfer", "split"], i);

      let subtotal = 0;
      const lineItems: Array<{ productId: string; quantity: number; unitPrice: number; discount: number; lineTotal: number }> = [];

      for (let j = 0; j < itemCount; j += 1) {
        const product = pickFrom(products, i * 3 + j);
        const quantity = 1 + ((i + j) % 4);
        const unitPrice = product.sellPrice;
        const discount = (i + j) % 5 === 0 ? 500 : 0;
        const lineTotal = Math.max(quantity * unitPrice - discount, 0);

        subtotal += quantity * unitPrice;
        lineItems.push({ productId: product.id, quantity, unitPrice, discount, lineTotal });
      }

      const saleDiscount = i % 6 === 0 ? 1000 : 0;
      const promoCode = i % 4 === 0 ? "BULK10" : null;
      const promoDiscount = promoCode ? Math.floor(Math.max(subtotal - saleDiscount, 0) * 0.1) : 0;
      const total = Math.max(subtotal - saleDiscount - promoDiscount, 0);
      const paidAmount = method === "cash" || method === "qris" || method === "transfer" ? total + (method === "cash" ? 3000 : 0) : total;
      const changeAmount = method === "cash" ? Math.max(paidAmount - total, 0) : 0;

      await prisma.sale.upsert({
        where: { id: saleId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          cashierUserId: cashierId,
          idempotencyKey: `bulk-sale-key-${store.id}-${i}`,
          paymentMethod: method,
          paymentDetails: method === "split"
            ? {
                cash: Math.floor(total * 0.4),
                qris: Math.floor(total * 0.5),
                transfer: Math.max(total - Math.floor(total * 0.9), 0)
              }
            : null,
          referenceNumber: method === "cash" ? null : `REF-BULK-${s + 1}-${String(i).padStart(5, "0")}`,
          paidAmount,
          changeAmount,
          subtotal,
          discount: saleDiscount,
          promoCode,
          promoDiscount,
          total,
          soldAt
        },
        create: {
          id: saleId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          cashierUserId: cashierId,
          idempotencyKey: `bulk-sale-key-${store.id}-${i}`,
          paymentMethod: method,
          paymentDetails: method === "split"
            ? {
                cash: Math.floor(total * 0.4),
                qris: Math.floor(total * 0.5),
                transfer: Math.max(total - Math.floor(total * 0.9), 0)
              }
            : null,
          referenceNumber: method === "cash" ? null : `REF-BULK-${s + 1}-${String(i).padStart(5, "0")}`,
          paidAmount,
          changeAmount,
          subtotal,
          discount: saleDiscount,
          promoCode,
          promoDiscount,
          total,
          soldAt
        }
      });

      for (let j = 0; j < lineItems.length; j += 1) {
        const item = lineItems[j];
        const saleItemId = toDeterministicUuid(`bulk-sale-item-${saleId}-${j}`);

        await prisma.saleItem.upsert({
          where: { id: saleItemId },
          update: {
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.lineTotal
          },
          create: {
            id: saleItemId,
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.lineTotal
          }
        });

        await prisma.stockMovement.upsert({
          where: { id: toDeterministicUuid(`bulk-stock-sale-${saleId}-${j}`) },
          update: {
            storeId: store.id,
            productId: item.productId,
            type: "sale",
            quantity: item.quantity,
            reason: `sale:${saleId}`,
            referenceId: saleId
          },
          create: {
            id: toDeterministicUuid(`bulk-stock-sale-${saleId}-${j}`),
            storeId: store.id,
            productId: item.productId,
            type: "sale",
            quantity: item.quantity,
            reason: `sale:${saleId}`,
            referenceId: saleId
          }
        });
      }
    }

    for (let i = 1; i <= expensesPerStore; i += 1) {
      const expenseId = toDeterministicUuid(`bulk-expense-${store.id}-${i}`);
      await prisma.expense.upsert({
        where: { id: expenseId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          title: `${pickFrom(expenseTitles, i)} ${i}`,
          amount: 25000 + ((i * 7500) % 300000),
          notes: "Auto seeded bulk expense",
          spentAt: toIsoDaysAgo(i % 40, 12)
        },
        create: {
          id: expenseId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          title: `${pickFrom(expenseTitles, i)} ${i}`,
          amount: 25000 + ((i * 7500) % 300000),
          notes: "Auto seeded bulk expense",
          spentAt: toIsoDaysAgo(i % 40, 12)
        }
      });
    }

    for (let i = 1; i <= shiftsPerStore; i += 1) {
      const shiftId = toDeterministicUuid(`bulk-shift-${store.id}-${i}`);
      const open = i % 5 === 0;
      const openingCash = 150000 + ((i * 10000) % 200000);
      const expectedCash = openingCash + 300000 + ((i * 13000) % 250000);
      const closingCash = open ? null : expectedCash + ((i % 3) - 1) * 5000;

      await prisma.cashierShift.upsert({
        where: { id: shiftId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          openedByUserId: cashierId,
          openingCash,
          expectedCash: open ? null : expectedCash,
          closingCash,
          cashDifference: open || closingCash === null ? null : closingCash - expectedCash,
          notes: open ? "Shift masih berjalan" : "Shift selesai otomatis",
          status: open ? "open" : "closed",
          openedAt: toIsoDaysAgo((i % 30) + 1, 7 + (i % 3)),
          closedAt: open ? null : toIsoDaysAgo(i % 30, 17)
        },
        create: {
          id: shiftId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          openedByUserId: cashierId,
          openingCash,
          expectedCash: open ? null : expectedCash,
          closingCash,
          cashDifference: open || closingCash === null ? null : closingCash - expectedCash,
          notes: open ? "Shift masih berjalan" : "Shift selesai otomatis",
          status: open ? "open" : "closed",
          openedAt: toIsoDaysAgo((i % 30) + 1, 7 + (i % 3)),
          closedAt: open ? null : toIsoDaysAgo(i % 30, 17)
        }
      });
    }

    for (let i = 1; i <= stockOpnameSessionsPerStore; i += 1) {
      const sessionId = toDeterministicUuid(`bulk-opname-session-${store.id}-${i}`);
      const status = pickFrom(["open", "submitted", "approved", "rejected"] as const, i);
      const assigneeId = cashiers[(i + s) % cashiers.length] ?? cashierId;
      const approvedBy = status === "approved" ? managerId : null;

      await prisma.stockOpnameSession.upsert({
        where: { id: sessionId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          assignedTo: assigneeId,
          assignedBy: managerId,
          assignedAt: toIsoDaysAgo((i % 25) + 1, 9),
          approvedBy,
          status,
          notes: `Session opname bulk ${i}`,
          approvedAt: status === "approved" ? toIsoDaysAgo(i % 20, 16) : null
        },
        create: {
          id: sessionId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          createdBy: managerId,
          assignedTo: assigneeId,
          assignedBy: managerId,
          assignedAt: toIsoDaysAgo((i % 25) + 1, 9),
          approvedBy,
          status,
          notes: `Session opname bulk ${i}`,
          approvedAt: status === "approved" ? toIsoDaysAgo(i % 20, 16) : null
        }
      });

      for (let j = 0; j < 8; j += 1) {
        const product = pickFrom(products, i * 11 + j);
        const systemStock = 40 + ((i + j) % 70);
        const difference = (i + j) % 3 === 0 ? -2 : (i + j) % 4 === 0 ? 3 : 0;
        const countedStock = Math.max(systemStock + difference, 0);
        const itemId = toDeterministicUuid(`bulk-opname-item-${sessionId}-${j}`);

        await prisma.stockOpnameItem.upsert({
          where: { id: itemId },
          update: {
            sessionId,
            productId: product.id,
            systemStock,
            countedStock,
            difference
          },
          create: {
            id: itemId,
            sessionId,
            productId: product.id,
            systemStock,
            countedStock,
            difference
          }
        });

        if (status === "approved" && difference !== 0) {
          const movementId = toDeterministicUuid(`bulk-opname-adjustment-${sessionId}-${j}`);
          await prisma.stockMovement.upsert({
            where: { id: movementId },
            update: {
              storeId: store.id,
              productId: product.id,
              type: "adjustment",
              quantity: Math.abs(difference),
              reason: `stock_opname_approved:${sessionId}`,
              referenceId: sessionId
            },
            create: {
              id: movementId,
              storeId: store.id,
              productId: product.id,
              type: "adjustment",
              quantity: Math.abs(difference),
              reason: `stock_opname_approved:${sessionId}`,
              referenceId: sessionId
            }
          });
        }
      }
    }

    for (let i = 1; i <= ticketsPerStore; i += 1) {
      const ticketId = toDeterministicUuid(`bulk-ticket-${store.id}-${i}`);
      const status = pickFrom(["open", "in_progress", "resolved"] as const, i);
      await prisma.supportTicket.upsert({
        where: { id: ticketId },
        update: {
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          openedBy: managerId,
          title: `${pickFrom(ticketTitles, i)} #${i}`,
          description: `Tiket dummy otomatis untuk validasi flow support (${store.name})`,
          priority: pickFrom(["low", "normal", "high"], i),
          status
        },
        create: {
          id: ticketId,
          tenantId: MAIN_TENANT_ID,
          storeId: store.id,
          openedBy: managerId,
          title: `${pickFrom(ticketTitles, i)} #${i}`,
          description: `Tiket dummy otomatis untuk validasi flow support (${store.name})`,
          priority: pickFrom(["low", "normal", "high"], i),
          status
        }
      });
    }
  }

  const summary = {
    tenantId: MAIN_TENANT_ID,
    stores: stores.length,
    managers: managers.length,
    cashiers: cashiers.length,
    products: stores.length * productsPerStore,
    purchases: stores.length * purchasesPerStore,
    sales: stores.length * salesPerStore,
    expenses: stores.length * expensesPerStore,
    shifts: stores.length * shiftsPerStore,
    stockOpnameSessions: stores.length * stockOpnameSessionsPerStore,
    tickets: stores.length * ticketsPerStore,
    promos: promoMap.size,
    scale
  };

  console.log("✅ Bulk dummy seed completed", summary);
  console.log("Login demo (all bulk users password):", DEFAULT_PASSWORD);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
