const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000/api";
const HEALTH_MAX_MS = Number(process.env.SLA_HEALTH_MAX_MS ?? 500);
const AUTH_MAX_MS = Number(process.env.SLA_AUTH_MAX_MS ?? 1200);
const DASHBOARD_MAX_MS = Number(process.env.SLA_DASHBOARD_MAX_MS ?? 1500);

async function timedRequest(path: string, init?: RequestInit) {
  const startedAt = performance.now();
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const elapsedMs = performance.now() - startedAt;
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    elapsedMs,
    data
  };
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`📈 SLA check -> ${API_BASE_URL}`);

  const health = await timedRequest("/health");
  assert(health.status === 200, "Health endpoint failed");
  assert(health.elapsedMs <= HEALTH_MAX_MS, `Health SLA breach: ${health.elapsedMs.toFixed(2)}ms > ${HEALTH_MAX_MS}ms`);

  const login = await timedRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@klontong.local", password: "password123" })
  });
  assert(login.status === 200, "Auth login failed");
  assert(login.elapsedMs <= AUTH_MAX_MS, `Auth SLA breach: ${login.elapsedMs.toFixed(2)}ms > ${AUTH_MAX_MS}ms`);

  const accessToken = (login.data as { accessToken: string }).accessToken;

  const stores = await timedRequest("/stores?page=1&pageSize=10&isActive=true", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  assert(stores.status === 200, "Stores endpoint failed");
  const storeId = (stores.data as { items: Array<{ id: string }> }).items[0]?.id;
  assert(Boolean(storeId), "No active store found for dashboard SLA check");

  const today = new Date().toISOString().slice(0, 10);
  const dashboard = await timedRequest(`/dashboard/summary?storeId=${storeId}&date=${today}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  assert(dashboard.status === 200, "Dashboard summary failed");
  assert(
    dashboard.elapsedMs <= DASHBOARD_MAX_MS,
    `Dashboard SLA breach: ${dashboard.elapsedMs.toFixed(2)}ms > ${DASHBOARD_MAX_MS}ms`
  );

  console.log("✅ SLA check PASSED");
}

run().catch((error) => {
  console.error("❌ SLA check FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
