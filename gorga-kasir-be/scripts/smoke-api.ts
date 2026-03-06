import { randomUUID } from "crypto";

type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    isSuperAdmin?: boolean;
  };
};

type ApiResponse<T> = {
  status: number;
  data: T;
};

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Content-Type", "application/json");

  if (init?.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${data?.message ?? response.statusText}`);
  }

  return {
    status: response.status,
    data: data as T
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`🚀 Smoke test start -> ${API_BASE_URL}`);

  const ownerLogin = await request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@klontong.local", password: "password123" })
  });
  assert(ownerLogin.data.accessToken, "Owner login failed: access token missing");
  console.log("✅ Auth login (owner)");

  const ownerRefresh = await request<SessionResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: ownerLogin.data.refreshToken })
  });
  assert(ownerRefresh.data.accessToken, "Owner refresh failed: access token missing");
  console.log("✅ Auth refresh");

  const stores = await request<{ items: Array<{ id: string; name: string; isActive: boolean }> }>("/stores?page=1&pageSize=50&isActive=true", {
    token: ownerRefresh.data.accessToken
  });
  assert(stores.data.items.length > 0, "No stores found for owner");
  const storeId = stores.data.items[0].id;

  const products = await request<{ items: Array<{ id: string; sellPrice: string }> }>(
    `/products?page=1&pageSize=20&storeId=${storeId}`,
    { token: ownerRefresh.data.accessToken }
  );
  assert(products.data.items.length > 0, "No products found for selected store");
  const product = products.data.items[0];

  const idempotencyKey = randomUUID();
  const salePayload = {
    idempotencyKey,
    storeId,
    paymentMethod: "cash",
    paidAmount: Number(product.sellPrice),
    soldAt: new Date().toISOString(),
    discount: 0,
    items: [{ productId: product.id, quantity: 1, unitPrice: Number(product.sellPrice) }]
  };

  const saleCreated = await request<{ status: string; saleId: string }>("/sales", {
    method: "POST",
    token: ownerRefresh.data.accessToken,
    body: JSON.stringify(salePayload)
  });
  assert(saleCreated.data.status === "created", "Sale create did not return created status");
  console.log("✅ Sales create");

  const saleDuplicate = await request<{ status: string }>("/sales", {
    method: "POST",
    token: ownerRefresh.data.accessToken,
    body: JSON.stringify(salePayload)
  });
  assert(saleDuplicate.data.status === "duplicate_ignored", "Sale idempotency check failed");
  console.log("✅ Sales idempotency duplicate");

  const today = new Date().toISOString().slice(0, 10);
  const dashboard = await request<{ date: string; transactionCount: number }>(
    `/dashboard/summary?storeId=${storeId}&date=${today}`,
    { token: ownerRefresh.data.accessToken }
  );
  assert(dashboard.data.date === today, "Dashboard summary date mismatch");
  console.log("✅ Dashboard summary");

  const superAdminLogin = await request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "superadmin@klontong.local", password: "password123" })
  });
  assert(superAdminLogin.data.user.isSuperAdmin, "Super admin login failed");

  const adminSubscriptions = await request<{
    items: Array<{
      id: string;
      subscription: { plan: string; status: "trial" | "active" | "past_due" | "inactive"; endsAt: string | null } | null;
    }>;
  }>("/admin/subscriptions?page=1&pageSize=10", {
    token: superAdminLogin.data.accessToken
  });
  assert(adminSubscriptions.data.items.length > 0, "Admin subscription list is empty");
  console.log("✅ Admin subscription list");

  const targetTenant = adminSubscriptions.data.items[0];
  const patchPayload = {
    plan: targetTenant.subscription?.plan ?? "starter",
    status: targetTenant.subscription?.status ?? "active",
    ...(targetTenant.subscription?.endsAt ? { endsAt: targetTenant.subscription.endsAt } : {})
  };

  const adminUpdate = await request<{ id: string; tenantId: string }>(`/admin/tenants/${targetTenant.id}/subscription`, {
    method: "PATCH",
    token: superAdminLogin.data.accessToken,
    body: JSON.stringify(patchPayload)
  });
  assert(Boolean(adminUpdate.data.id), "Admin subscription update failed");
  console.log("✅ Admin subscription update");

  console.log("🎉 Smoke test PASSED");
}

run().catch((error) => {
  console.error("❌ Smoke test FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
