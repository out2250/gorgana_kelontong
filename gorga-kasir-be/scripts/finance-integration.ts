import { randomUUID } from "crypto";

type SessionResponse = {
  accessToken: string;
  user: {
    id: string;
    role: "owner" | "manager" | "cashier";
    tenantId: string;
  };
};

type ListResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type StoreItem = {
  id: string;
  name: string;
  isActive: boolean;
};

type SupplierItem = {
  id: string;
  name: string;
};

type ProductItem = {
  id: string;
  sellPrice: string;
};

type ApAgingItem = {
  id: string;
  outstandingAmount: number;
  isSettled: boolean;
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

async function login(email: string, password: string) {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  assert(result.status === 200, `Login failed for ${email}`);
  return result.data as SessionResponse;
}

async function run() {
  console.log(`💰 Finance integration test -> ${API_BASE_URL}`);

  const owner = await login("owner@klontong.local", "password123");
  const manager = await login("manager@klontong.local", "password123");

  const storesRes = await request("/stores?page=1&pageSize=20&isActive=true", {
    token: owner.accessToken
  });
  assert(storesRes.status === 200, "Failed to fetch stores");
  const stores = storesRes.data as ListResponse<StoreItem>;
  assert(stores.items.length > 0, "No active stores found");
  const storeId = stores.items[0].id;

  const suppliersRes = await request("/catalog/suppliers?page=1&pageSize=20&isActive=true", {
    token: owner.accessToken
  });
  assert(suppliersRes.status === 200, "Failed to fetch suppliers");
  const suppliers = suppliersRes.data as ListResponse<SupplierItem>;

  let supplierId = suppliers.items[0]?.id;
  if (!supplierId) {
    const createdSupplierRes = await request("/catalog/suppliers", {
      method: "POST",
      token: owner.accessToken,
      body: JSON.stringify({
        name: `Auto Supplier ${Date.now()}`,
        isActive: true
      })
    });
    assert(createdSupplierRes.status === 201, "Failed to create supplier");
    supplierId = (createdSupplierRes.data as SupplierItem).id;
  }

  const productsRes = await request(`/products?storeId=${storeId}&page=1&pageSize=20`, {
    token: owner.accessToken
  });
  assert(productsRes.status === 200, "Failed to fetch products");
  const products = productsRes.data as ListResponse<ProductItem>;
  assert(products.items.length > 0, "No products found in store");

  const product = products.items[0];
  const purchaseDate = new Date().toISOString();

  const purchaseRes = await request("/purchases", {
    method: "POST",
    token: owner.accessToken,
    body: JSON.stringify({
      storeId,
      supplierId,
      invoiceNumber: `INV-${Date.now()}`,
      purchasedAt: purchaseDate,
      items: [
        {
          productId: product.id,
          quantity: 1,
          unitCost: 1000
        }
      ]
    })
  });

  assert(purchaseRes.status === 201, "Failed to create purchase for AP aging test");
  const purchaseId = (purchaseRes.data as { id: string }).id;

  const apAgingBeforeRes = await request(`/finance/ap-aging?storeId=${storeId}&page=1&pageSize=50`, {
    token: owner.accessToken
  });
  assert(apAgingBeforeRes.status === 200, "Failed to fetch AP aging (before settle)");

  const apAgingBefore = apAgingBeforeRes.data as {
    items: ApAgingItem[];
  };

  const createdPurchaseAp = apAgingBefore.items.find((item) => item.id === purchaseId);
  assert(Boolean(createdPurchaseAp), "Created purchase not found in AP aging");
  assert(!createdPurchaseAp?.isSettled, "New purchase should be unsettled");

  const settleRes = await request(`/finance/ap-aging/${purchaseId}/settle`, {
    method: "POST",
    token: owner.accessToken
  });
  assert(settleRes.status === 200, "Failed to settle AP purchase");

  const apAgingAfterRes = await request(`/finance/ap-aging?storeId=${storeId}&page=1&pageSize=50`, {
    token: owner.accessToken
  });
  assert(apAgingAfterRes.status === 200, "Failed to fetch AP aging (after settle)");

  const apAgingAfter = apAgingAfterRes.data as {
    items: ApAgingItem[];
  };

  const settledPurchaseAp = apAgingAfter.items.find((item) => item.id === purchaseId);
  assert(Boolean(settledPurchaseAp), "Settled purchase not found in AP aging");
  assert(settledPurchaseAp?.isSettled, "Purchase should be marked settled");
  assert(Number(settledPurchaseAp?.outstandingAmount ?? 1) === 0, "Settled purchase outstanding amount should be zero");

  const closeThroughAt = new Date().toISOString();

  const managerCloseRes = await request("/finance/period-closing/close", {
    method: "POST",
    token: manager.accessToken,
    body: JSON.stringify({ closeThroughAt })
  });
  assert(managerCloseRes.status === 403, "Manager should not be allowed to close period");

  const ownerCloseRes = await request("/finance/period-closing/close", {
    method: "POST",
    token: owner.accessToken,
    body: JSON.stringify({ closeThroughAt })
  });
  assert(ownerCloseRes.status === 200, "Owner failed to close period");

  const periodStatusRes = await request("/finance/period-closing", {
    token: owner.accessToken
  });
  assert(periodStatusRes.status === 200, "Failed to read period closing status");

  const periodStatus = periodStatusRes.data as {
    closedThroughAt: string | null;
  };
  assert(periodStatus.closedThroughAt === closeThroughAt, "Closed period timestamp mismatch");

  const saleRes = await request("/sales", {
    method: "POST",
    token: owner.accessToken,
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      storeId,
      paymentMethod: "cash",
      soldAt: closeThroughAt,
      discount: 0,
      paidAmount: Number(product.sellPrice),
      items: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: Number(product.sellPrice),
          discount: 0
        }
      ]
    })
  });

  assert(saleRes.status === 423, "Sale in closed period should be blocked with 423");

  console.log("✅ Finance integration PASSED");
}

run().catch((error) => {
  console.error("❌ Finance integration FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
