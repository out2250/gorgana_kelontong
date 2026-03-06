export {};

type SessionResponse = {
  accessToken: string;
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

async function run() {
  console.log(`🔐 Costing permission integration -> ${API_BASE_URL}`);

  const ownerLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@klontong.local", password: "password123" })
  });
  assert(ownerLogin.status === 200, "Owner login failed");
  const ownerSession = ownerLogin.data as SessionResponse;

  const managerLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "manager@klontong.local", password: "password123" })
  });
  assert(managerLogin.status === 200, "Manager login failed");
  const managerSession = managerLogin.data as SessionResponse;

  const setFifo = await request("/finance/costing-method", {
    method: "POST",
    token: ownerSession.accessToken,
    body: JSON.stringify({ inventoryCostingMethod: "fifo" })
  });
  assert(setFifo.status === 200, "Owner failed to set FIFO costing method");

  const managerSetCosting = await request("/finance/costing-method", {
    method: "POST",
    token: managerSession.accessToken,
    body: JSON.stringify({ inventoryCostingMethod: "weighted_average" })
  });
  assert(managerSetCosting.status === 403, "Manager should not be allowed to update costing method");

  const resetCosting = await request("/finance/costing-method", {
    method: "POST",
    token: ownerSession.accessToken,
    body: JSON.stringify({ inventoryCostingMethod: "weighted_average" })
  });
  assert(resetCosting.status === 200, "Owner failed to reset costing method");

  console.log("✅ Costing permission integration PASSED");
}

run().catch((error) => {
  console.error("❌ Costing permission integration FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
