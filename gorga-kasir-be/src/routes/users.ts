import bcrypt from "bcryptjs";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/audit";
import { validatePasswordPolicy } from "../lib/password-policy";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const CreateUserSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(["owner", "manager", "cashier"]),
  address: z.string().optional(),
  phoneNumber: z.string().optional(),
  jobResponsibility: z.string().min(2),
  conditionStatus: z.enum(["on_duty", "on_leave", "sick", "on_penalty"]).default("on_duty"),
  attendanceStatus: z.enum(["present", "absent", "late", "off"]).default("off"),
  scheduleLabel: z.string().optional(),
  scheduleStartTime: z.string().optional(),
  scheduleEndTime: z.string().optional(),
  storeId: z.string().uuid().optional(),
  storeIds: z.array(z.string().uuid()).default([])
});

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(10),
  search: z.string().optional(),
  storeId: z.string().uuid().optional(),
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  isActive: z.coerce.boolean().optional(),
  conditionStatus: z.enum(["on_duty", "on_leave", "sick", "on_penalty"]).optional(),
  attendanceStatus: z.enum(["present", "absent", "late", "off"]).optional()
});

const UpdateEmployeeSchema = z.object({
  isActive: z.coerce.boolean().optional(),
  conditionStatus: z.enum(["on_duty", "on_leave", "sick", "on_penalty"]).optional(),
  attendanceStatus: z.enum(["present", "absent", "late", "off"]).optional(),
  scheduleLabel: z.string().optional(),
  scheduleStartTime: z.string().optional(),
  scheduleEndTime: z.string().optional()
});

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/users",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner", "manager"),
        requirePermission("users.manage")
      ]
    },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const query = ListUsersQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, storeId, role, isActive, conditionStatus, attendanceStatus } = query.data;
      const skip = (page - 1) * pageSize;

      const where = {
        ...(!request.auth?.isSuperAdmin ? { tenantId } : {}),
        ...(storeId
          ? {
              storeAccess: {
                some: {
                  storeId
                }
              }
            }
          : {}),
        ...(role ? { role } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(conditionStatus ? { conditionStatus } : {}),
        ...(attendanceStatus ? { attendanceStatus } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } }
              ]
            }
          : {})
      };

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: {
            storeAccess: {
              include: {
                store: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: users.map((user: any) => ({
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          address: user.address,
          phoneNumber: user.phoneNumber,
          jobResponsibility: user.jobResponsibility,
          conditionStatus: user.conditionStatus,
          attendanceStatus: user.attendanceStatus,
          scheduleLabel: user.scheduleLabel,
          scheduleStartTime: user.scheduleStartTime,
          scheduleEndTime: user.scheduleEndTime,
          isActive: user.isActive,
          stores: user.storeAccess.map((access: any) => ({
            id: access.store.id,
            name: access.store.name
          }))
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(Math.ceil(total / pageSize), 1)
        }
      };
    }
  );

  app.post(
    "/users",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner"),
        requirePermission("users.manage")
      ]
    },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      const isSuperAdmin = request.auth?.isSuperAdmin;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return reply.status(400).send({
          message: firstIssue
            ? `Invalid payload: ${firstIssue.path.join(".") || "field"} ${firstIssue.message}`
            : "Invalid payload"
        });
      }


      // Owner cannot create user with role owner
      if (!isSuperAdmin && parsed.data.role === "owner") {
        return reply.status(403).send({ message: "Owner cannot create user with role owner" });
      }

      // Only one owner per tenant (except superadmin)
      if (parsed.data.role === "owner" && !isSuperAdmin) {
        const ownerCount = await prisma.user.count({
          where: {
            tenantId,
            role: "owner"
          }
        });
        if (ownerCount > 0) {
          return reply.status(422).send({ message: "Tenant already has an owner" });
        }
      }

      const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (existing) {
        return reply.status(409).send({ message: "Email already used" });
      }

      const existingUsername = await prisma.user.findFirst({
        where: { username: parsed.data.username }
      });
      if (existingUsername) {
        return reply.status(409).send({ message: "Username already used" });
      }

      const passwordPolicyError = validatePasswordPolicy(parsed.data.password);
      if (passwordPolicyError) {
        return reply.status(422).send({ message: passwordPolicyError });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const requestedStoreIds = parsed.data.storeId
        ? [parsed.data.storeId]
        : parsed.data.storeIds;

      if (requestedStoreIds.length === 0) {
        return reply.status(400).send({ message: "storeId is required" });
      }

      const validStores = await prisma.store.findMany({
        where: {
          id: { in: requestedStoreIds },
          tenantId
        },
        select: { id: true }
      });

      if (validStores.length !== requestedStoreIds.length) {
        return reply.status(422).send({ message: "One or more stores are not part of your tenant" });
      }

      const created = await prisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            username: parsed.data.username,
            fullName: parsed.data.fullName,
            email: parsed.data.email,
            passwordHash,
            role: parsed.data.role,
            address: parsed.data.address,
            phoneNumber: parsed.data.phoneNumber,
            jobResponsibility: parsed.data.jobResponsibility,
            conditionStatus: parsed.data.conditionStatus,
            attendanceStatus: parsed.data.attendanceStatus,
            scheduleLabel: parsed.data.scheduleLabel,
            scheduleStartTime: parsed.data.scheduleStartTime,
            scheduleEndTime: parsed.data.scheduleEndTime
          }
        });

        await tx.userStoreAccess.createMany({
          data: validStores.map((store: any) => ({
            userId: user.id,
            storeId: store.id
          })),
          skipDuplicates: true
        });

        return user;
      });

      await writeAuditLog({
        request,
        tenantId,
        action: "user.create",
        entityType: "user",
        entityId: created.id,
        afterData: {
          role: created.role,
          email: created.email,
          username: created.username,
          isActive: created.isActive
        }
      });

      return reply.status(201).send({
        id: created.id,
        username: created.username,
        fullName: created.fullName,
        email: created.email,
        role: created.role,
        address: created.address,
        phoneNumber: created.phoneNumber,
        jobResponsibility: created.jobResponsibility,
        conditionStatus: created.conditionStatus,
        attendanceStatus: created.attendanceStatus,
        scheduleLabel: created.scheduleLabel,
        scheduleStartTime: created.scheduleStartTime,
        scheduleEndTime: created.scheduleEndTime,
        isActive: created.isActive
      });
    }
  );

  app.patch(
    "/users/:id/employment",
    {
      preHandler: [
        requireAuth,
        requireActiveSubscription,
        requireRoles("owner"),
        requirePermission("users.manage")
      ]
    },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = UpdateEmployeeSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const where = {
        id: params.data.id,
        ...(request.auth?.isSuperAdmin ? {} : { tenantId: request.auth?.tenantId })
      };

      const existing = await prisma.user.findFirst({ where });
      if (!existing) {
        return reply.status(404).send({ message: "User not found" });
      }

      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(typeof parsed.data.isActive === "boolean" ? { isActive: parsed.data.isActive } : {}),
          ...(parsed.data.conditionStatus ? { conditionStatus: parsed.data.conditionStatus } : {}),
          ...(parsed.data.attendanceStatus ? { attendanceStatus: parsed.data.attendanceStatus } : {}),
          ...(typeof parsed.data.scheduleLabel === "string" ? { scheduleLabel: parsed.data.scheduleLabel } : {}),
          ...(typeof parsed.data.scheduleStartTime === "string" ? { scheduleStartTime: parsed.data.scheduleStartTime } : {}),
          ...(typeof parsed.data.scheduleEndTime === "string" ? { scheduleEndTime: parsed.data.scheduleEndTime } : {})
        }
      });

      await writeAuditLog({
        request,
        tenantId: request.auth?.tenantId,
        action: "user.employment.update",
        entityType: "user",
        entityId: updated.id,
        beforeData: {
          isActive: existing.isActive,
          conditionStatus: existing.conditionStatus,
          attendanceStatus: existing.attendanceStatus,
          scheduleLabel: existing.scheduleLabel,
          scheduleStartTime: existing.scheduleStartTime,
          scheduleEndTime: existing.scheduleEndTime
        },
        afterData: {
          isActive: updated.isActive,
          conditionStatus: updated.conditionStatus,
          attendanceStatus: updated.attendanceStatus,
          scheduleLabel: updated.scheduleLabel,
          scheduleStartTime: updated.scheduleStartTime,
          scheduleEndTime: updated.scheduleEndTime
        }
      });

      return {
        id: updated.id,
        isActive: updated.isActive,
        conditionStatus: updated.conditionStatus,
        attendanceStatus: updated.attendanceStatus,
        scheduleLabel: updated.scheduleLabel,
        scheduleStartTime: updated.scheduleStartTime,
        scheduleEndTime: updated.scheduleEndTime
      };
    }
  );
}
