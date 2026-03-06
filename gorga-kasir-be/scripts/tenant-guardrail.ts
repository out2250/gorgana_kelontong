type SessionResponse = {
  accessToken: string;
};

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api";

async function request(path: string, init?: RequestInit & { token?: string }) {
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

async function run() {
  console.log(`🔒 Tenant guardrail test -> ${API_BASE_URL}`);

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@klontong.local", password: "password123" })
  });

  assert(login.status === 200, "Owner login failed");
  const session = login.data as SessionResponse;

  const foreignStoreId = "00000000-0000-0000-0000-000000000103";

  const products = await request(`/products?storeId=${foreignStoreId}&page=1&pageSize=10`, {
    token: session.accessToken
  });
  assert(products.status === 403 || products.status === 404, "Cross-tenant products should be blocked");

  const createPurchase = await request("/purchases", {
    method: "POST",
    token: session.accessToken,
    body: JSON.stringify({
      storeId: foreignStoreId,
      supplierId: "00000000-0000-0000-0000-000000000301",
      purchasedAt: new Date().toISOString(),
      items: [
        {
          productId: "00000000-0000-0000-0000-000000000010",
          quantity: 1,
          unitCost: 1000
        }
      ]
    })
  });
  assert(createPurchase.status === 403, "Cross-tenant purchase create should be blocked");

  console.log("✅ Tenant guardrail PASSED");
}

run().catch((error) => {
  console.error("❌ Tenant guardrail FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
