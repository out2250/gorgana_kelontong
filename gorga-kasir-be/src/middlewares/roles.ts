import { FastifyReply, FastifyRequest } from "fastify";

type UserRole = "owner" | "manager" | "cashier";

export type AppPermission =
  | "sales.create"
  | "sales.return"
  | "purchase.create"
  | "purchase.receive"
  | "stock-opname.approve"
  | "finance.expense.create"
  | "finance.period.close"
  | "users.manage";

const rolePermissionMap: Record<UserRole, Set<AppPermission>> = {
  owner: new Set<AppPermission>([
    "sales.create",
    "sales.return",
    "purchase.create",
    "purchase.receive",
    "stock-opname.approve",
    "finance.expense.create",
    "finance.period.close",
    "users.manage"
  ]),
  manager: new Set<AppPermission>([
    "sales.create",
    "sales.return",
    "purchase.create",
    "purchase.receive",
    "stock-opname.approve",
    "finance.expense.create"
  ]),
  cashier: new Set<AppPermission>([
    "sales.create",
    "sales.return"
  ])
};

export function hasPermission(role: UserRole, isSuperAdmin: boolean | undefined, permission: AppPermission) {
  if (isSuperAdmin) {
    return true;
  }

  return rolePermissionMap[role].has(permission);
}

export function requireRoles(...roles: Array<"owner" | "manager" | "cashier">) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (request.auth.isSuperAdmin) {
      return;
    }

    if (!roles.includes(request.auth.role)) {
      return reply.status(403).send({ message: "Forbidden" });
    }
  };
}

export function requirePermission(permission: AppPermission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (!hasPermission(request.auth.role, request.auth.isSuperAdmin, permission)) {
      return reply.status(403).send({ message: "Forbidden" });
    }
  };
}

export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) {
    return reply.status(401).send({ message: "Unauthorized" });
  }

  if (!request.auth.isSuperAdmin) {
    return reply.status(403).send({ message: "Forbidden" });
  }
}
