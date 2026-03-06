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
};

type StoreItem = {
  id: string;
  isActive: boolean;
};

type ProductItem = {
  id: string;
  sellPrice: string;
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
  console.log(`🛡️ Hardening integration test -> ${API_BASE_URL}`);

  const owner = await login("owner@klontong.local", "password123");
  const manager = await login("manager@klontong.local", "password123");

  const managerUsersRes = await request("/users?page=1&pageSize=5", {
    token: manager.accessToken
  });
  assert(managerUsersRes.status === 403, "Manager must be blocked by users.manage permission");

  const ownerUsersRes = await request("/users?page=1&pageSize=5", {
    token: owner.accessToken
  });
  assert(ownerUsersRes.status === 200, "Owner should be able to access users list");

  const storesRes = await request("/stores?page=1&pageSize=20&isActive=true", {
    token: owner.accessToken
  });
  assert(storesRes.status === 200, "Failed to fetch stores");
  const stores = storesRes.data as ListResponse<StoreItem>;
  assert(stores.items.length > 0, "No active store found");
  const storeId = stores.items[0].id;

  const productsRes = await request(`/products?storeId=${storeId}&page=1&pageSize=20`, {
    token: owner.accessToken
  });
  assert(productsRes.status === 200, "Failed to fetch products");
  const products = productsRes.data as ListResponse<ProductItem>;
  assert(products.items.length > 0, "No product found for sync test");
  const product = products.items[0];

  const closeThroughAt = new Date().toISOString();
  const closeRes = await request("/finance/period-closing/close", {
    method: "POST",
    token: owner.accessToken,
    body: JSON.stringify({ closeThroughAt })
  });
  assert(closeRes.status === 200 || closeRes.status === 400, "Period closing endpoint should be callable");

  const syncRes = await request("/sync/sales", {
    method: "POST",
    token: owner.accessToken,
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      storeId,
      paymentMethod: "cash",
      paidAmount: Number(product.sellPrice),
      soldAt: closeThroughAt,
      discount: 0,
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

  assert(syncRes.status === 423, "Sync sales should be blocked by closed period");

  console.log("✅ Hardening integration PASSED");
}

run().catch((error) => {
  console.error("❌ Hardening integration FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
