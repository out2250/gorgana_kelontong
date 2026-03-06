import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string;
      role: "owner" | "manager" | "cashier";
      isSuperAdmin?: boolean;
    };
  }
}
