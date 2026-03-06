import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireSuperAdmin } from "../middlewares/roles";

const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  status: z.enum(["trial", "active", "past_due", "inactive"]).optional(),
  paymentStatus: z.enum(["paid", "unpaid"]).optional(),
  tenantStatus: z.enum(["pending_approval", "active", "rejected", "inactive"]).optional()
});

const UpdateSubscriptionSchema = z.object({
  plan: z.string().min(2),
  status: z.enum(["trial", "active", "past_due", "inactive"]),
  paymentStatus: z.enum(["paid", "unpaid"]).default("unpaid"),
  trialEnabled: z.boolean().optional(),
  endsAt: z.string().datetime().optional()
});

const TenantParamSchema = z.object({ tenantId: z.string().uuid() });

const RejectSchema = z.object({
  reason: z.string().min(3)
});

const ActionReasonSchema = z.object({
  reason: z.string().min(3).optional()
});

const TrialAccessSchema = z.object({
  enabled: z.boolean()
});

const PricingPackageSchema = z.object({
  id: z.string().min(2),
  label: z.string().min(2),
  months: z.number().int().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
  freeMonths: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});

const UpsertPricingSchema = z.object({
  baseMonthlyPrice: z.number().positive(),
  promoNote: z.string().max(500).optional(),
  packages: z.array(PricingPackageSchema).min(1)
});

type SubscriptionPricingSettings = {
  baseMonthlyPrice: number;
  promoNote?: string;
  packages: Array<z.infer<typeof PricingPackageSchema>>;
  updatedAt?: string;
};

export async function adminSubscriptionRoutes(app: FastifyInstance) {
  function defaultPricingSettings(): SubscriptionPricingSettings {
    return {
      baseMonthlyPrice: 150000,
      promoNote: "Base 1 bulan: 150rb",
      packages: [
        { id: "1_month", label: "1 Bulan", months: 1, discountPercent: 0, freeMonths: 0, isActive: true },
        { id: "3_months", label: "3 Bulan", months: 3, discountPercent: 5, freeMonths: 0, isActive: true },
        { id: "6_months", label: "6 Bulan", months: 6, discountPercent: 10, freeMonths: 1, isActive: true },
        { id: "1_year", label: "12 Bulan", months: 12, discountPercent: 15, freeMonths: 2, isActive: true }
      ]
    };
  }

  function readPricingSettings(additionalData: unknown): SubscriptionPricingSettings {
    if (!additionalData || typeof additionalData !== "object") {
      return defaultPricingSettings();
    }

    const root = additionalData as { subscriptionPricing?: unknown };
    if (!root.subscriptionPricing || typeof root.subscriptionPricing !== "object") {
      return defaultPricingSettings();
    }

    const parsed = UpsertPricingSchema.safeParse(root.subscriptionPricing);
    if (!parsed.success) {
      return defaultPricingSettings();
    }

    return {
      ...parsed.data,
      updatedAt: new Date().toISOString()
    };
  }

  function writePricingSettings(additionalData: unknown, settings: SubscriptionPricingSettings) {
    const root = additionalData && typeof additionalData === "object"
      ? { ...(additionalData as Record<string, unknown>) }
      : {};

    root.subscriptionPricing = {
      baseMonthlyPrice: settings.baseMonthlyPrice,
      promoNote: settings.promoNote ?? "",
      packages: settings.packages,
      updatedAt: settings.updatedAt ?? new Date().toISOString()
    };

    return root;
  }

  function enrichPricing(settings: SubscriptionPricingSettings) {
    return {
      ...settings,
      packages: settings.packages.map((item) => {
        const paidMonths = item.months;
        const effectiveMonths = item.months + item.freeMonths;
        const grossPrice = paidMonths * settings.baseMonthlyPrice;
        const discountAmount = Math.floor(grossPrice * (item.discountPercent / 100));
        const finalPrice = Math.max(grossPrice - discountAmount, 0);

        return {
          ...item,
          grossPrice,
          discountAmount,
          finalPrice,
          effectiveMonths,
          effectiveMonthlyPrice: effectiveMonths > 0 ? Math.floor(finalPrice / effectiveMonths) : finalPrice
        };
      })
    };
  }

  function computeEndsAtFromPlan(plan: string, approvedAt: Date) {
    const planToMonths: Record<string, number> = {
      "1_month": 1,
      "3_months": 3,
      "6_months": 6,
      "1_year": 12
    };

    const months = planToMonths[plan] ?? 1;
    const endsAt = new Date(approvedAt);
    endsAt.setMonth(endsAt.getMonth() + months);
    return endsAt;
  }

  app.get(
    "/admin/subscriptions",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const parsed = ListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, search, status, paymentStatus, tenantStatus } = parsed.data;
      const skip = (page - 1) * pageSize;

      const subscriptionSomeFilter = {
        ...(status ? { status } : {}),
        ...(paymentStatus ? { paymentStatus } : {})
      };

      const where = {
        ...(tenantStatus ? { status: tenantStatus } : {}),
        ...(search
          ? {
              name: {
                contains: search,
                mode: "insensitive" as const
              }
            }
          : {}),
        ...(Object.keys(subscriptionSomeFilter).length > 0
          ? {
              subscriptions: {
                some: subscriptionSomeFilter
              }
            }
          : {})
      };

      const [total, tenants] = await Promise.all([
        prisma.tenant.count({ where }),
        prisma.tenant.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1
            },
            _count: {
              select: {
                users: true,
                stores: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        })
      ]);

      return {
        items: tenants.map((tenant: any) => ({
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          fullName: tenant.fullName,
          contactPhone: tenant.contactPhone,
          address: tenant.address,
          approvedAt: tenant.approvedAt,
          rejectionReason: tenant.rejectionReason,
          usersCount: tenant._count.users,
          storesCount: tenant._count.stores,
          subscription: tenant.subscriptions[0] ?? null
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

  app.patch(
    "/admin/tenants/:tenantId/subscription",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = z.object({ tenantId: z.string().uuid() }).safeParse(request.params);
      const parsed = UpdateSubscriptionSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: params.data.tenantId } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const subscription = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: parsed.data.plan,
          status: parsed.data.status,
          paymentStatus: parsed.data.paymentStatus,
          trialEnabled: parsed.data.trialEnabled ?? true,
          startsAt: new Date(),
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
        }
      });

      return subscription;
    }
  );

  app.post(
    "/admin/subscription-approvals/:tenantId/approve",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Invalid params" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: params.data.tenantId } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const latestSubscription = await prisma.subscription.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" }
      });

      if (!latestSubscription) {
        return reply.status(422).send({ message: "Subscription not found" });
      }

      if (latestSubscription.paymentStatus !== "paid") {
        return reply.status(422).send({ message: "Tenant can only be approved when subscription is PAID" });
      }

      await prisma.$transaction(async (tx: any) => {
        const approvedAt = new Date();
        const endsAt = computeEndsAtFromPlan(latestSubscription.plan, approvedAt);

        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "active",
            approvedAt,
            approvedBy: request.auth?.userId,
            rejectionReason: null
          }
        });

        await tx.subscription.update({
          where: { id: latestSubscription.id },
          data: {
            status: latestSubscription.trialEnabled ? "trial" : "active",
            requestStatus: "approve",
            startsAt: approvedAt,
            endsAt
          }
        });

        await tx.user.updateMany({
          where: {
            tenantId: tenant.id,
            role: "owner"
          },
          data: {
            isActive: true
          }
        });
      });

      return { status: "approved" };
    }
  );

  app.post(
    "/admin/subscription-approvals/:tenantId/reject",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      const body = RejectSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: params.data.tenantId } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      if (tenant.status === "active") {
        return reply.status(409).send({ message: "Tenant already approved. Use refund or force inactive." });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "rejected",
            rejectionReason: body.data.reason,
            approvedAt: null,
            approvedBy: null
          }
        });

        await tx.user.updateMany({
          where: { tenantId: tenant.id },
          data: { isActive: false }
        });

        const latestSubscription = await tx.subscription.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" }
        });

        if (latestSubscription) {
          await tx.subscription.update({
            where: { id: latestSubscription.id },
            data: {
              requestStatus: "rejected",
              status: "inactive"
            }
          });
        }
      });

      return { status: "rejected" };
    }
  );

  app.post(
    "/admin/subscription-approvals/:tenantId/refund",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      const body = ActionReasonSchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: params.data.tenantId } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "inactive",
            rejectionReason: body.data.reason ?? "Refund processed by super admin"
          }
        });

        await tx.user.updateMany({
          where: { tenantId: tenant.id },
          data: { isActive: false }
        });

        const latestSubscription = await tx.subscription.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" }
        });

        if (latestSubscription) {
          await tx.subscription.update({
            where: { id: latestSubscription.id },
            data: {
              status: "inactive",
              paymentStatus: "unpaid",
              requestStatus: "refund",
              trialEnabled: false
            }
          });
        }
      });

      return { status: "refund" };
    }
  );

  app.post(
    "/admin/subscription-approvals/:tenantId/force-inactive",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      const body = ActionReasonSchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: params.data.tenantId } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            status: "inactive",
            rejectionReason: body.data.reason ?? "Force inactive by super admin"
          }
        });

        await tx.user.updateMany({
          where: { tenantId: tenant.id },
          data: { isActive: false }
        });

        const latestSubscription = await tx.subscription.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" }
        });

        if (latestSubscription) {
          await tx.subscription.update({
            where: { id: latestSubscription.id },
            data: {
              status: "inactive",
              requestStatus: "force_inactive",
              trialEnabled: false
            }
          });
        }
      });

      return { status: "force_inactive" };
    }
  );

  app.patch(
    "/admin/tenants/:tenantId/trial-access",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = TenantParamSchema.safeParse(request.params);
      const body = TrialAccessSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const latestSubscription = await prisma.subscription.findFirst({
        where: { tenantId: params.data.tenantId },
        orderBy: { createdAt: "desc" }
      });

      if (!latestSubscription) {
        return reply.status(404).send({ message: "Subscription not found" });
      }

      const updated = await prisma.subscription.update({
        where: { id: latestSubscription.id },
        data: {
          trialEnabled: body.data.enabled,
          status: body.data.enabled ? "trial" : "inactive"
        }
      });

      return updated;
    }
  );

  app.get(
    "/admin/subscription-pricing",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      return enrichPricing(readPricingSettings(tenant.additionalData));
    }
  );

  app.put(
    "/admin/subscription-pricing",
    { preHandler: [requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = UpsertPricingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const nextSettings: SubscriptionPricingSettings = {
        ...parsed.data,
        updatedAt: new Date().toISOString()
      };

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writePricingSettings(tenant.additionalData, nextSettings) as unknown as object
        }
      });

      return enrichPricing(nextSettings);
    }
  );
}
