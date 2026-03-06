import bcrypt from "bcryptjs";
import crypto from "crypto";
import { FastifyInstance, FastifyRequest } from "fastify";
import { generateSecret, generateURI, verify } from "otplib";
import { z } from "zod";

import { writeAuditLog } from "../lib/audit";
import { env } from "../lib/env";
import { getAccessTokenExpiresAt, signAccessToken } from "../lib/jwt";
import { isObjectStorageConfigured, uploadProfileImage } from "../lib/object-storage";
import { validatePasswordPolicy } from "../lib/password-policy";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(16)
});

const LoginMfaVerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/)
});

const MfaEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

const SessionRevokeParamsSchema = z.object({
  id: z.string().uuid()
});

const UploadProfileImageSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  dataUrl: z.string().min(50).max(1_500_000)
});

const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(120),
  address: z.string().max(255).optional().nullable(),
  phoneNumber: z.string().max(30).optional().nullable(),
  profileImageUrl: z.string().max(500000, "Profile image terlalu besar").optional().nullable()
});

const SignupOwnerSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  tenantName: z.string().min(2),
  address: z.string().min(3),
  fullName: z.string().min(2),
  dateOfBirth: z.string().optional(),
  contactPhone: z.string().min(8),
  additionalData: z.record(z.any()).optional(),
  plan: z.string().min(2).max(50).default("1_month")
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Password confirmation does not match"
    });
  }
});

const SUPER_ADMIN_EMAIL = "superadmin@klontong.local";
const DEVICE_HEADER = "x-device-id";
const MFA_CHALLENGE_TTL_MINUTES = 5;

const PricingPackageSchema = z.object({
  id: z.string().min(2),
  label: z.string().min(2),
  months: z.number().int().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
  freeMonths: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});

const SubscriptionPricingSchema = z.object({
  baseMonthlyPrice: z.number().positive(),
  promoNote: z.string().max(500).optional(),
  packages: z.array(PricingPackageSchema).min(1)
});

type SubscriptionPricingSettings = z.infer<typeof SubscriptionPricingSchema>;

function defaultSubscriptionPricing(): SubscriptionPricingSettings {
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

function readSubscriptionPricing(additionalData: unknown): SubscriptionPricingSettings {
  if (!additionalData || typeof additionalData !== "object") {
    return defaultSubscriptionPricing();
  }

  const root = additionalData as { subscriptionPricing?: unknown };
  if (!root.subscriptionPricing || typeof root.subscriptionPricing !== "object") {
    return defaultSubscriptionPricing();
  }

  const parsed = SubscriptionPricingSchema.safeParse(root.subscriptionPricing);
  if (!parsed.success) {
    return defaultSubscriptionPricing();
  }

  return parsed.data;
}

function enrichSubscriptionPricing(settings: SubscriptionPricingSettings) {
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

async function resolvePublicSubscriptionPricingSettings() {
  const superAdmin = await prisma.user.findFirst({
    where: { email: SUPER_ADMIN_EMAIL },
    select: {
      tenant: {
        select: {
          additionalData: true
        }
      }
    }
  });

  return readSubscriptionPricing(superAdmin?.tenant?.additionalData);
}

function resolveDeviceId(request: FastifyRequest) {
  const headerValue = request.headers[DEVICE_HEADER] || request.headers[DEVICE_HEADER.toLowerCase()];
  const deviceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return typeof deviceId === "string" && deviceId.trim().length > 0
    ? deviceId.trim().slice(0, 191)
    : "unknown-device";
}

async function isLockedOut(email: string, ipAddress: string) {
  const windowStart = new Date(Date.now() - env.authLockoutWindowMinutes * 60 * 1000);
  const failures = await prisma.loginAttempt.count({
    where: {
      email,
      ipAddress,
      isSuccess: false,
      attemptedAt: { gte: windowStart }
    }
  });

  if (failures < env.authLockoutMaxAttempts) {
    return false;
  }

  return true;
}

async function trackLoginAttempt(input: {
  email: string;
  ipAddress: string;
  userAgent?: string;
  isSuccess: boolean;
  userId?: string;
}) {
  await prisma.loginAttempt.create({
    data: {
      email: input.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      isSuccess: input.isSuccess,
      userId: input.userId
    }
  });
}

function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

async function validateTenantAccess(user: {
  tenantId: string;
  isSuperAdmin?: boolean;
}) {
  if (user.isSuperAdmin) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { status: true }
  });

  if (!tenant || tenant.status !== "active") {
    return "Tenant is not active";
  }

  const latestSubscription = await prisma.subscription.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" }
  });

  if (!latestSubscription) {
    return "Subscription not found";
  }

  const hasRuntimeAccess = ["active", "trial"].includes(latestSubscription.status);
  const paymentOk = latestSubscription.status === "trial" || latestSubscription.paymentStatus === "paid";
  const isExpired = Boolean(latestSubscription.endsAt && new Date(latestSubscription.endsAt).getTime() < Date.now());

  if (isExpired) {
    return "Subscription expired";
  }

  if (!hasRuntimeAccess || !paymentOk) {
    return "Subscription inactive or unpaid";
  }

  return null;
}

async function issueSession(user: {
  id: string;
  tenantId: string;
  role: "owner" | "manager" | "cashier";
  isSuperAdmin?: boolean;
  fullName: string;
  email: string;
  address?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
}, context: {
  ipAddress: string;
  userAgent?: string;
  deviceId: string;
}) {
  const accessToken = signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin
  });

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const refreshTokenExpiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiresAt,
      deviceId: context.deviceId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      lastUsedAt: new Date()
    }
  });

  return {
    accessToken,
    accessTokenExpiresAt: getAccessTokenExpiresAt(accessToken).toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isSuperAdmin: Boolean(user.isSuperAdmin),
      tenantId: user.tenantId,
      address: user.address ?? null,
      phoneNumber: user.phoneNumber ?? null,
      profileImageUrl: user.profileImageUrl ?? null
    }
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/subscription-plans", async () => {
    const settings = await resolvePublicSubscriptionPricingSettings();
    return enrichSubscriptionPricing(settings);
  });

  app.post("/auth/signup-owner", {
    config: {
      rateLimit: {
        max: env.rateLimitAuthMax,
        timeWindow: env.rateLimitAuthWindow
      }
    }
  }, async (request, reply) => {
    const parsed = SignupOwnerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existingEmail) {
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

    const pricingSettings = await resolvePublicSubscriptionPricingSettings();
    const activePlanIds = pricingSettings.packages.filter((item) => item.isActive).map((item) => item.id);

    const defaultPlan = parsed.data.plan;
    if (activePlanIds.length > 0 && !activePlanIds.includes(defaultPlan)) {
      return reply.status(422).send({ message: "Plan subscription tidak valid atau tidak aktif" });
    }

    const dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;

    const created = await prisma.$transaction(async (tx: any) => {
      const tenant = await tx.tenant.create({
        data: {
          name: parsed.data.tenantName,
          status: "pending_approval",
          fullName: parsed.data.fullName,
          contactPhone: parsed.data.contactPhone,
          address: parsed.data.address,
          dateOfBirth,
          additionalData: parsed.data.additionalData
        }
      });

      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username: parsed.data.username,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          passwordHash,
          role: "owner",
          isActive: false,
          address: parsed.data.address,
          phoneNumber: parsed.data.contactPhone,
          jobResponsibility: "Store Owner"
        }
      });

      const store = await tx.store.create({
        data: {
          tenantId: tenant.id,
          name: `${parsed.data.tenantName} Main Store`,
          address: parsed.data.address,
          isActive: true
        }
      });

      await tx.userStoreAccess.create({
        data: {
          userId: owner.id,
          storeId: store.id
        }
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: defaultPlan,
          status: "inactive",
          paymentStatus: "unpaid",
          trialEnabled: true,
          startsAt: new Date(),
          endsAt: null
        }
      });

      return { tenantId: tenant.id, ownerId: owner.id };
    });

    return reply.status(201).send({
      status: "PENDING_APPROVAL",
      tenantId: created.tenantId,
      ownerId: created.ownerId,
      message: "Please contact the following number to proceed with the subscription process: +62-822-1014-2288 (WhatsApp)"
    });
  });

  app.post("/auth/login", {
    config: {
      rateLimit: {
        max: env.rateLimitAuthMax,
        timeWindow: env.rateLimitAuthWindow
      }
    }
  }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];

    if (await isLockedOut(email, ipAddress)) {
      return reply.status(429).send({
        message: `Too many failed login attempts. Try again in ${env.authLockoutWindowMinutes} minutes`
      });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      await trackLoginAttempt({
        email,
        ipAddress,
        userAgent,
        isSuccess: false
      });
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    const matched = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!matched) {
      await trackLoginAttempt({
        email,
        ipAddress,
        userAgent,
        isSuccess: false,
        userId: user.id
      });
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return reply.status(403).send({ message: "Account inactive or pending approval" });
    }

    const isSuperAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    const accessError = await validateTenantAccess({
      tenantId: user.tenantId,
      isSuperAdmin
    });
    if (accessError) {
      return reply.status(403).send({ message: accessError });
    }

    const mustUseMfa = Boolean(user.mfaEnabled && (isSuperAdmin || user.role === "owner"));
    if (mustUseMfa) {
      const challenge = await prisma.loginChallenge.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000)
        }
      });

      return {
        mfaRequired: true,
        challengeId: challenge.id,
        message: "OTP required"
      };
    }

    await trackLoginAttempt({
      email,
      ipAddress,
      userAgent,
      isSuccess: true,
      userId: user.id
    });

    return issueSession({
      ...user,
      isSuperAdmin
    }, {
      ipAddress,
      userAgent,
      deviceId: resolveDeviceId(request)
    });
  });

  app.post("/auth/login/verify-otp", {
    config: {
      rateLimit: {
        max: env.rateLimitAuthMax,
        timeWindow: env.rateLimitAuthWindow
      }
    }
  }, async (request, reply) => {
    const parsed = LoginMfaVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const challenge = await prisma.loginChallenge.findUnique({
      where: { id: parsed.data.challengeId },
      include: { user: true }
    });

    if (!challenge || challenge.fulfilledAt || challenge.expiresAt < new Date()) {
      return reply.status(401).send({ message: "Challenge expired" });
    }

    if (challenge.attempts >= 5) {
      return reply.status(429).send({ message: "Too many OTP attempts" });
    }

    if (!challenge.user.mfaEnabled || !challenge.user.mfaSecret) {
      return reply.status(400).send({ message: "MFA not enabled" });
    }

    const isValidCode = verify({
      token: parsed.data.code,
      secret: challenge.user.mfaSecret
    });

    if (!isValidCode) {
      await prisma.loginChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } }
      });
      return reply.status(401).send({ message: "Invalid OTP code" });
    }

    const isSuperAdmin = challenge.user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    await prisma.loginChallenge.update({
      where: { id: challenge.id },
      data: { fulfilledAt: new Date() }
    });

    await trackLoginAttempt({
      email: challenge.user.email,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      isSuccess: true,
      userId: challenge.user.id
    });

    return issueSession({
      ...challenge.user,
      isSuperAdmin
    }, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      deviceId: resolveDeviceId(request)
    });
  });

  app.post("/auth/refresh", {
    config: {
      rateLimit: {
        max: env.rateLimitAuthMax,
        timeWindow: env.rateLimitAuthWindow
      }
    }
  }, async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const hashed = hashRefreshToken(parsed.data.refreshToken);

    const currentToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashed },
      include: { user: true }
    });

    if (!currentToken || currentToken.revokedAt || currentToken.expiresAt < new Date()) {
      return reply.status(401).send({ message: "Invalid refresh token" });
    }

    if (!currentToken.user.isActive) {
      return reply.status(401).send({ message: "User inactive" });
    }

    const isSuperAdmin = currentToken.user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    const accessError = await validateTenantAccess({
      tenantId: currentToken.user.tenantId,
      isSuperAdmin
    });
    if (accessError) {
      return reply.status(403).send({ message: accessError });
    }

    await prisma.refreshToken.update({
      where: { id: currentToken.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() }
    });

    return issueSession({
      ...currentToken.user,
      isSuperAdmin
    }, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      deviceId: resolveDeviceId(request)
    });
  });

  app.post("/auth/logout", {
    config: {
      rateLimit: {
        max: env.rateLimitAuthMax,
        timeWindow: env.rateLimitAuthWindow
      }
    }
  }, async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const hashed = hashRefreshToken(parsed.data.refreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashed,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return { status: "logged_out" };
  });

  app.get("/auth/sessions", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        deviceId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true
      }
    });

    return { items: sessions };
  });

  app.post("/auth/sessions/revoke-all", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return { status: "revoked_all" };
  });

  app.delete("/auth/sessions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = SessionRevokeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Invalid params" });
    }

    const token = await prisma.refreshToken.findFirst({
      where: {
        id: params.data.id,
        userId
      },
      select: { id: true }
    });

    if (!token) {
      return reply.status(404).send({ message: "Session not found" });
    }

    await prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() }
    });

    return { status: "revoked" };
  });

  app.get("/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        storeAccess: {
          include: {
            store: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return reply.status(404).send({ message: "User not found" });
    }

    const latestSubscription = await prisma.subscription.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" }
    });

    const now = Date.now();
    const endsAtMs = latestSubscription?.endsAt ? new Date(latestSubscription.endsAt).getTime() : null;
    const daysLeft = endsAtMs ? Math.ceil((endsAtMs - now) / (24 * 60 * 60 * 1000)) : null;
    const isExpired = Boolean(endsAtMs && endsAtMs < now);

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      address: user.address,
      phoneNumber: user.phoneNumber,
      profileImageUrl: user.profileImageUrl,
      mfaEnabled: user.mfaEnabled,
      stores: user.storeAccess.map((access: any) => access.store),
      subscription: latestSubscription
        ? {
            plan: latestSubscription.plan,
            status: latestSubscription.status,
            paymentStatus: latestSubscription.paymentStatus,
            startsAt: latestSubscription.startsAt,
            endsAt: latestSubscription.endsAt,
            daysLeft,
            isExpired
          }
        : null
    };
  });

  app.patch("/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const parsed = UpdateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        message: "Invalid payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const payload = parsed.data;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: payload.fullName.trim(),
        address: payload.address?.trim() || null,
        phoneNumber: payload.phoneNumber?.trim() || null,
        profileImageUrl: payload.profileImageUrl || null
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        tenantId: true,
        address: true,
        phoneNumber: true,
        profileImageUrl: true
      }
    });

    return updated;
  });

  app.post("/auth/mfa/setup", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true }
    });

    if (!me) {
      return reply.status(404).send({ message: "User not found" });
    }

    const isSuperAdmin = me.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin && me.role !== "owner") {
      return reply.status(403).send({ message: "MFA setup only for owner/superadmin" });
    }

    const secret = generateSecret();
    const issuer = "Gorga Kasir";
    const label = me.email;
    const otpauthUrl = generateURI({ label, issuer, secret });

    await prisma.user.update({
      where: { id: me.id },
      data: {
        mfaTempSecret: secret
      }
    });

    return {
      secret,
      otpauthUrl
    };
  });

  app.post("/auth/mfa/enable", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const parsed = MfaEnableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, mfaTempSecret: true }
    });

    if (!me?.mfaTempSecret) {
      return reply.status(400).send({ message: "MFA setup not started" });
    }

    const isSuperAdmin = me.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin && me.role !== "owner") {
      return reply.status(403).send({ message: "MFA enable only for owner/superadmin" });
    }

    const valid = verify({
      token: parsed.data.code,
      secret: me.mfaTempSecret
    });

    if (!valid) {
      return reply.status(401).send({ message: "Invalid OTP code" });
    }

    await prisma.user.update({
      where: { id: me.id },
      data: {
        mfaEnabled: true,
        mfaSecret: me.mfaTempSecret,
        mfaTempSecret: null
      }
    });

    return { status: "mfa_enabled" };
  });

  app.post("/auth/mfa/disable", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaTempSecret: null
      }
    });

    return { status: "mfa_disabled" };
  });

  app.post("/auth/profile-image/upload", { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (!isObjectStorageConfigured()) {
      return reply.status(503).send({ message: "Object storage is not configured" });
    }

    const parsed = UploadProfileImageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Invalid payload" });
    }

    const { dataUrl, mimeType } = parsed.data;
    if (!mimeType.startsWith("image/")) {
      return reply.status(422).send({ message: "Invalid image type" });
    }

    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      return reply.status(422).send({ message: "Invalid image data" });
    }

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 900_000) {
      return reply.status(422).send({ message: "Image is too large" });
    }

    const imageUrl = await uploadProfileImage({
      userId,
      mimeType,
      bytes
    });

    await writeAuditLog({
      request,
      action: "profile.image.upload",
      entityType: "user",
      entityId: userId,
      afterData: { imageUrl }
    });

    return { imageUrl };
  });
}
