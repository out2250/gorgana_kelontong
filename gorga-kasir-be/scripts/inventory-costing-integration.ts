export {};

import { prisma } from "../src/lib/prisma";

type SessionResponse = {
  accessToken: string;
};

type ListResponse<T> = {
  items: T[];
};

type StoreItem = {
  id: string;
  isActive: boolean;
};

type ProductItem = {
  id: string;
  name?: string;
  sku: string;
  sellPrice: string;
  stockOnHand: number;
  costPrice: string | number | null;
};

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api";

async function request(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (init?.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    data
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function toNumber(input: string | number | null | undefined, fallback = 0) {
  if (input === null || input === undefined) {
    return fallback;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

async function getFifoLayerQty(tenantId: string, storeId: string, productId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { additionalData: true }
  });

  const additionalData = tenant?.additionalData as { finance?: { fifoLayers?: Record<string, Array<{ quantity: number }>> } } | null;
  const key = `${storeId}:${productId}`;
  const layers = additionalData?.finance?.fifoLayers?.[key] ?? [];

  return layers.reduce((sum, layer) => sum + Number(layer.quantity ?? 0), 0);
}

async function resetCostingMethod(ownerToken: string) {
  const resetCosting = await request("/finance/costing-method", {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({ inventoryCostingMethod: "weighted_average" })
  });

  if (resetCosting.status !== 200) {
    console.warn("⚠️ Failed to reset costing method to weighted_average");
  }
}

async function run() {
  console.log(`📦 Inventory costing flow integration -> ${API_BASE_URL}`);

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@klontong.local", password: "password123" })
  });
  assert(login.status === 200, "Owner login failed");

  const session = login.data as SessionResponse;

  const storesRes = await request("/stores?page=1&pageSize=20&isActive=true", {
    token: session.accessToken
  });
  assert(storesRes.status === 200, "Failed to fetch stores");
  const stores = storesRes.data as ListResponse<StoreItem>;
  assert(stores.items.length > 0, "No active stores found");
  const storeId = stores.items[0].id;

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { tenantId: true }
  });
  assert(Boolean(store?.tenantId), "Store tenant not found");
  const tenantId = store!.tenantId;

  const productsRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(productsRes.status === 200, "Failed to fetch products");
  const products = productsRes.data as ListResponse<ProductItem>;
  assert(products.items.length > 0, "No products found for costing test");

  const product = products.items[0];
  let secondaryProduct = products.items[1] as ProductItem | undefined;
  if (!secondaryProduct) {
    const createdSecondary = await prisma.product.create({
      data: {
        storeId,
        sku: `INT-FIFO-${Date.now()}`,
        name: "Integration FIFO Product",
        sellPrice: 15000,
        minimumStock: 0,
        stockOnHand: 20,
        unitMeasure: "mL",
        unitValue: 1,
        sellCategories: ["pcs"],
        isActive: true
      },
      select: {
        id: true,
        name: true,
        sku: true,
        sellPrice: true,
        stockOnHand: true,
        costPrice: true
      }
    });

    secondaryProduct = {
      id: createdSecondary.id,
      name: createdSecondary.name,
      sku: createdSecondary.sku,
      sellPrice: String(createdSecondary.sellPrice),
      stockOnHand: Number(createdSecondary.stockOnHand),
      costPrice: createdSecondary.costPrice ? String(createdSecondary.costPrice) : null
    };
  }

  assert(Boolean(secondaryProduct), "Secondary product is required for multi-item FIFO test");
  const baseStock = toNumber(product.stockOnHand, 0);
  const baseCost = toNumber(product.costPrice, 1000);

  const incomingQty = 3;
  const incomingCost = baseCost + 500;

  const purchaseRes = await request("/catalog/suppliers?page=1&pageSize=20&isActive=true", {
    token: session.accessToken
  });
  assert(purchaseRes.status === 200, "Failed to fetch suppliers");
  const suppliers = purchaseRes.data as ListResponse<{ id: string }>;
  assert(suppliers.items.length > 0, "No suppliers found for costing test");

  const setFifo = await request("/finance/costing-method", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({ inventoryCostingMethod: "fifo" })
  });
  assert(setFifo.status === 200, "Failed to set FIFO costing method");

  try {

  const fifoBefore = await getFifoLayerQty(tenantId, storeId, product.id);

  const createPurchase = await request("/purchases", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId,
      supplierId: suppliers.items[0].id,
      purchasedAt: new Date().toISOString(),
      items: [
        {
          productId: product.id,
          quantity: incomingQty,
          unitCost: incomingCost
        }
      ]
    })
  });

  assert(createPurchase.status === 201, "Failed to create purchase for costing test");

  const productsAfterRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(productsAfterRes.status === 200, "Failed to fetch products after purchase");
  const productsAfter = productsAfterRes.data as ListResponse<ProductItem>;
  const updatedProduct = productsAfter.items.find((item) => item.id === product.id);
  assert(Boolean(updatedProduct), "Updated product not found");

  const expectedCost = ((baseCost * baseStock) + (incomingCost * incomingQty)) / (baseStock + incomingQty);
  const actualCost = toNumber(updatedProduct?.costPrice, 0);

  assert(Number.isFinite(actualCost) && actualCost > 0, "Actual cost is invalid");
  assert(Math.abs(actualCost - expectedCost) < 0.01, "Weighted average cost calculation mismatch");

  const partialIncomingQty = 5;
  const partialUnitCost = incomingCost + 250;

  const beforePartialStock = toNumber(updatedProduct?.stockOnHand, 0);
  const beforePartialCost = toNumber(updatedProduct?.costPrice, expectedCost);

  const createDeferredPurchase = await request("/purchases", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId,
      supplierId: suppliers.items[0].id,
      receiveNow: false,
      purchasedAt: new Date().toISOString(),
      items: [
        {
          productId: product.id,
          quantity: partialIncomingQty,
          unitCost: partialUnitCost
        }
      ]
    })
  });

  assert(createDeferredPurchase.status === 201, "Failed to create deferred purchase");

  const deferredPurchaseId = (createDeferredPurchase.data as { id: string }).id;
  assert(Boolean(deferredPurchaseId), "Deferred purchase id missing");

  const afterDeferredCreateRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(afterDeferredCreateRes.status === 200, "Failed to fetch products after deferred purchase create");
  const afterDeferredCreate = (afterDeferredCreateRes.data as ListResponse<ProductItem>).items.find((item) => item.id === product.id);
  assert(Boolean(afterDeferredCreate), "Product missing after deferred purchase create");
  assert(toNumber(afterDeferredCreate?.stockOnHand, 0) === beforePartialStock, "Stock changed before receiving deferred purchase");

  const firstReceiveQty = 2;
  const receivePartial = await request(`/purchases/${deferredPurchaseId}/receive`, {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: firstReceiveQty }]
    })
  });

  assert(receivePartial.status === 200, "Failed to receive partial purchase qty");

  const afterFirstReceiveRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(afterFirstReceiveRes.status === 200, "Failed to fetch products after first partial receive");
  const afterFirstReceive = (afterFirstReceiveRes.data as ListResponse<ProductItem>).items.find((item) => item.id === product.id);
  assert(Boolean(afterFirstReceive), "Product missing after first partial receive");

  const expectedCostAfterFirstReceive = (
    (beforePartialCost * beforePartialStock) +
    (partialUnitCost * firstReceiveQty)
  ) / (beforePartialStock + firstReceiveQty);

  assert(
    Math.abs(toNumber(afterFirstReceive?.costPrice, 0) - expectedCostAfterFirstReceive) < 0.01,
    "Weighted average cost mismatch after first partial receive"
  );

  const overReceive = await request(`/purchases/${deferredPurchaseId}/receive`, {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: partialIncomingQty }]
    })
  });
  assert(overReceive.status === 400, "Over receive should be rejected");

  const secondReceiveQty = partialIncomingQty - firstReceiveQty;
  const receiveRemaining = await request(`/purchases/${deferredPurchaseId}/receive`, {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: secondReceiveQty }]
    })
  });
  assert(receiveRemaining.status === 200, "Failed to receive remaining purchase qty");

  const finalProductRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(finalProductRes.status === 200, "Failed to fetch products after full partial receive");
  const finalProduct = (finalProductRes.data as ListResponse<ProductItem>).items.find((item) => item.id === product.id);
  assert(Boolean(finalProduct), "Final product not found");

  const expectedFinalStock = beforePartialStock + partialIncomingQty;
  const expectedFinalCost = (
    (beforePartialCost * beforePartialStock) +
    (partialUnitCost * partialIncomingQty)
  ) / expectedFinalStock;

  assert(toNumber(finalProduct?.stockOnHand, 0) === expectedFinalStock, "Final stock after full partial receive mismatch");
  assert(Math.abs(toNumber(finalProduct?.costPrice, 0) - expectedFinalCost) < 0.01, "Final weighted cost after full partial receive mismatch");

  const fifoAfterReceive = await getFifoLayerQty(tenantId, storeId, product.id);
  assert(Math.abs((fifoAfterReceive - fifoBefore) - (incomingQty + partialIncomingQty)) < 0.0001, "FIFO layer qty mismatch after receive flow");

  const saleQty = 4;
  const saleRes = await request("/sales", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId,
      paymentMethod: "cash",
      paidAmount: toNumber(finalProduct?.sellPrice, 0) * saleQty,
      soldAt: new Date().toISOString(),
      discount: 0,
      items: [
        {
          productId: product.id,
          quantity: saleQty,
          unitPrice: toNumber(finalProduct?.sellPrice, 0)
        }
      ]
    })
  });
  assert(saleRes.status === 201, "Failed to create sales for FIFO consume test");

  const afterSaleRes = await request(`/products?storeId=${storeId}&page=1&pageSize=100`, {
    token: session.accessToken
  });
  assert(afterSaleRes.status === 200, "Failed to fetch products after sales");
  const afterSaleProduct = (afterSaleRes.data as ListResponse<ProductItem>).items.find((item) => item.id === product.id);
  assert(Boolean(afterSaleProduct), "Product missing after sales");
  assert(toNumber(afterSaleProduct?.stockOnHand, 0) === expectedFinalStock - saleQty, "Stock mismatch after sales on FIFO mode");

  const fifoAfterSale = await getFifoLayerQty(tenantId, storeId, product.id);
  assert(Math.abs((fifoAfterSale - fifoAfterReceive) + saleQty) < 0.0001, "FIFO layer qty not consumed correctly after sales");

  const secondaryIncomingQty = 4;
  const secondarySaleQty = 2;
  const primaryMultiIncomingQty = 2;
  const primaryMultiSaleQty = 1;

  const secondaryBaseCost = toNumber(secondaryProduct?.costPrice, 1200);
  const secondaryIncomingCost = secondaryBaseCost + 300;
  const secondaryFifoBefore = await getFifoLayerQty(tenantId, storeId, secondaryProduct!.id);
  const primaryFifoBeforeMulti = await getFifoLayerQty(tenantId, storeId, product.id);

  const createMultiPurchase = await request("/purchases", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId,
      supplierId: suppliers.items[0].id,
      purchasedAt: new Date().toISOString(),
      items: [
        {
          productId: product.id,
          quantity: primaryMultiIncomingQty,
          unitCost: incomingCost + 100
        },
        {
          productId: secondaryProduct!.id,
          quantity: secondaryIncomingQty,
          unitCost: secondaryIncomingCost
        }
      ]
    })
  });
  assert(createMultiPurchase.status === 201, "Failed to create multi-item purchase");

  const primaryFifoAfterMultiReceive = await getFifoLayerQty(tenantId, storeId, product.id);
  const secondaryFifoAfterMultiReceive = await getFifoLayerQty(tenantId, storeId, secondaryProduct!.id);

  assert(
    Math.abs((primaryFifoAfterMultiReceive - primaryFifoBeforeMulti) - primaryMultiIncomingQty) < 0.0001,
    "Primary FIFO qty mismatch after multi-item receive"
  );
  assert(
    Math.abs((secondaryFifoAfterMultiReceive - secondaryFifoBefore) - secondaryIncomingQty) < 0.0001,
    "Secondary FIFO qty mismatch after multi-item receive"
  );

  const multiSaleRes = await request("/sales", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId,
      paymentMethod: "cash",
      paidAmount: (toNumber(finalProduct?.sellPrice, 0) * primaryMultiSaleQty)
        + (toNumber(secondaryProduct?.sellPrice, 0) * secondarySaleQty),
      soldAt: new Date().toISOString(),
      discount: 0,
      items: [
        {
          productId: product.id,
          quantity: primaryMultiSaleQty,
          unitPrice: toNumber(finalProduct?.sellPrice, 0)
        },
        {
          productId: secondaryProduct!.id,
          quantity: secondarySaleQty,
          unitPrice: toNumber(secondaryProduct?.sellPrice, 0)
        }
      ]
    })
  });
  assert(multiSaleRes.status === 201, "Failed to create multi-item sales for FIFO consume test");

  const primaryFifoAfterMultiSale = await getFifoLayerQty(tenantId, storeId, product.id);
  const secondaryFifoAfterMultiSale = await getFifoLayerQty(tenantId, storeId, secondaryProduct!.id);

  assert(
    Math.abs((primaryFifoAfterMultiSale - primaryFifoAfterMultiReceive) + primaryMultiSaleQty) < 0.0001,
    "Primary FIFO qty not consumed correctly after multi-item sales"
  );
  assert(
    Math.abs((secondaryFifoAfterMultiSale - secondaryFifoAfterMultiReceive) + secondarySaleQty) < 0.0001,
    "Secondary FIFO qty not consumed correctly after multi-item sales"
  );

  } finally {
    await resetCostingMethod(session.accessToken);
  }

  console.log("✅ Inventory costing integration PASSED");
}

run().catch((error) => {
  console.error("❌ Inventory costing integration FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
