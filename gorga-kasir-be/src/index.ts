import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { FastifyError } from "fastify";
import { ZodError } from "zod";

import { adminSubscriptionRoutes } from "./routes/admin-subscriptions.js";
import { catalogRoutes } from "./routes/catalog.js";
import { env } from "./lib/env";
import { captureException, initObservability } from "./lib/observability";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { financeRoutes } from "./routes/finance.js";
import { healthRoutes } from "./routes/health.js";
import { hrRoutes } from "./routes/hr.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { promotionRoutes } from "./routes/promotions.js";
import { purchaseRoutes } from "./routes/purchases.js";
import { salesRoutes } from "./routes/sales.js";
import { shiftRoutes } from "./routes/shifts.js";
import { stockOpnameRoutes } from "./routes/stock-opname.js";
import { storeRoutes } from "./routes/stores.js";
import { supportRoutes } from "./routes/support.js";
import { syncRoutes } from "./routes/sync.js";
import { tenantDetailRoutes } from "./routes/tenant-details.js";
import { userRoutes } from "./routes/users.js";

type PrismaLikeError = {
  code?: string;
  name?: string;
};

function isPrismaKnownRequestError(error: unknown): error is PrismaLikeError {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
  );
}

function isPrismaValidationError(error: unknown): error is PrismaLikeError {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "PrismaClientValidationError"
  );
}

const app = Fastify({ logger: true });
initObservability();

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Unhandled request error");
  captureException(error, {
    url: request.url,
    method: request.method,
    userId: request.auth?.userId,
    tenantId: request.auth?.tenantId
  });

  if (error instanceof ZodError) {
    return reply.status(400).send({ message: "Invalid request payload" });
  }

  if (isPrismaKnownRequestError(error)) {
    if (error.code === "P2000") {
      return reply.status(400).send({ message: "Nilai data terlalu panjang" });
    }

    if (error.code === "P2002") {
      return reply.status(409).send({ message: "Duplicate data" });
    }

    if (error.code === "P2025") {
      return reply.status(404).send({ message: "Data not found" });
    }

    return reply.status(400).send({ message: "Database request failed" });
  }

  if (isPrismaValidationError(error)) {
    return reply.status(400).send({ message: "Invalid database input" });
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
    return reply.status(fastifyError.statusCode).send({
      message: fastifyError.message || "Request failed"
    });
  }

  return reply.status(500).send({ message: "Internal server error" });
});

async function bootstrap() {
  await app.register(helmet, {
    contentSecurityPolicy: false
  });

  await app.register(rateLimit, {
    global: false,
    hook: "onRequest",
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true
    },
    errorResponseBuilder: () => ({
      message: "Too many requests"
    })
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origin === env.frontendOrigin) {
        callback(null, true);
        return;
      }
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      callback(null, isLocalhost);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true
  });

  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(authRoutes);
    await api.register(dashboardRoutes);
    await api.register(inventoryRoutes);
    await api.register(promotionRoutes);
    await api.register(purchaseRoutes);
    await api.register(stockOpnameRoutes);
    await api.register(salesRoutes);
    await api.register(financeRoutes);
    await api.register(shiftRoutes);
    await api.register(storeRoutes);
    await api.register(userRoutes);
    await api.register(supportRoutes);
    await api.register(syncRoutes);
    await api.register(adminSubscriptionRoutes);
    await api.register(tenantDetailRoutes);
    await api.register(hrRoutes);
    await api.register(catalogRoutes);
  }, { prefix: "/api" });

  await app.listen({
    port: env.port,
    host: "0.0.0.0"
  });
}

bootstrap().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
