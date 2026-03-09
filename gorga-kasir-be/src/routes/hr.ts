import { randomUUID } from "crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireActiveSubscription } from "../middlewares/subscription";

const LeaveRequestSchema = z.object({
  type: z.enum(["leave", "sick"]),
  startDate: z.string().min(10),
  endDate: z.string().min(10),
  reason: z.string().min(3).max(500)
});

const LeaveDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional()
});

const AbsentCorrectionSchema = z.object({
  date: z.string().min(10),
  requestedClockIn: z.string().optional(),
  requestedClockOut: z.string().optional(),
  reason: z.string().min(3).max(500)
});

const CorrectionDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional()
});

const AttendanceEndSchema = z.object({
  force: z.boolean().optional()
});

const OvertimeAssignSchema = z.object({
  userId: z.string().uuid(),
  date: z.string().min(10),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().max(500).optional()
});

const OvertimeStatusSchema = z.object({
  status: z.enum(["assigned", "completed", "cancelled"])
});

const IdParamSchema = z.object({ id: z.string().uuid() });

const LeaveListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum(["leave", "sick"]).optional()
});

const AttendanceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  userId: z.string().uuid().optional(),
  date: z.string().optional()
});

const OvertimeListQuerySchema = z.object({
  status: z.enum(["assigned", "completed", "cancelled"]).optional(),
  userId: z.string().uuid().optional()
});

type LeaveRequestItem = {
  id: string;
  userId: string;
  userName: string;
  type: "leave" | "sick";
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
};

type AbsentCorrectionItem = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
};

type AttendanceLogItem = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startAt?: string;
  endAt?: string;
  status: "started" | "completed" | "blocked_leave";
  note?: string;
  overtimeAssignmentId?: string;
  createdAt: string;
};

type OvertimeAssignmentItem = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
  status: "assigned" | "completed" | "cancelled";
  assignedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

type HrData = {
  leaveRequests: LeaveRequestItem[];
  absentCorrections: AbsentCorrectionItem[];
  attendanceLogs: AttendanceLogItem[];
  overtimeAssignments: OvertimeAssignmentItem[];
};

function defaultHrData(): HrData {
  return {
    leaveRequests: [],
    absentCorrections: [],
    attendanceLogs: [],
    overtimeAssignments: []
  };
}

function readHrData(additionalData: unknown): HrData {
  if (!additionalData || typeof additionalData !== "object") {
    return defaultHrData();
  }

  const root = additionalData as { hrData?: unknown };
  if (!root.hrData || typeof root.hrData !== "object") {
    return defaultHrData();
  }

  const hrData = root.hrData as Partial<HrData>;

  return {
    leaveRequests: Array.isArray(hrData.leaveRequests) ? hrData.leaveRequests as LeaveRequestItem[] : [],
    absentCorrections: Array.isArray(hrData.absentCorrections) ? hrData.absentCorrections as AbsentCorrectionItem[] : [],
    attendanceLogs: Array.isArray(hrData.attendanceLogs) ? hrData.attendanceLogs as AttendanceLogItem[] : [],
    overtimeAssignments: Array.isArray(hrData.overtimeAssignments) ? hrData.overtimeAssignments as OvertimeAssignmentItem[] : []
  };
}

function writeHrData(additionalData: unknown, hrData: HrData) {
  const root = additionalData && typeof additionalData === "object"
    ? { ...(additionalData as Record<string, unknown>) }
    : {};

  root.hrData = hrData;
  return root;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isApprover(role: string | undefined, isSuperAdmin: boolean | undefined) {
  return Boolean(isSuperAdmin || role === "owner" || role === "manager");
}

function isDateBetween(target: string, start: string, end: string) {
  return target >= start && target <= end;
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return (hour * 60) + minute;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export async function hrRoutes(app: FastifyInstance) {
  app.get(
    "/hr/leave-requests/me",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { additionalData: true }
      });

      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const query = LeaveListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const hrData = readHrData(tenant.additionalData);
      const items = hrData.leaveRequests
        .filter((item) => item.userId === auth.userId)
        .filter((item) => query.data.status ? item.status === query.data.status : true)
        .filter((item) => query.data.type ? item.type === query.data.type : true)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return { items };
    }
  );
app.post(
    "/hr/leave-requests/:id/decision",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      if (!isApprover(auth.role, auth.isSuperAdmin)) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      const params = IdParamSchema.safeParse(request.params);
      const body = LeaveDecisionSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }
      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }
      const hrData = readHrData(tenant.additionalData);
      const targetIndex = hrData.leaveRequests.findIndex((item) => item.id === params.data.id);
      if (targetIndex < 0) {
        return reply.status(404).send({ message: "Leave request not found" });
      }
      const target = hrData.leaveRequests[targetIndex];
      if (target.status !== "pending") {
        return reply.status(409).send({ message: "Leave request already processed" });
      }
      const updated: LeaveRequestItem = {
        ...target,
        status: body.data.decision,
        note: body.data.note,
        reviewedByUserId: auth.userId,
        reviewedAt: new Date().toISOString()
      };
      hrData.leaveRequests[targetIndex] = updated;
      // If approved, update user status if leave is active
      if (body.data.decision === "approved") {
        const currentDate = todayDate();
        if (isDateBetween(currentDate, updated.startDate, updated.endDate)) {
          await prisma.user.update({
            where: { id: updated.userId },
            data: {
              conditionStatus: updated.type === "leave" ? "on_leave" : "sick",
              attendanceStatus: "off"
            }
          });
        }
      }
      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });
      return updated;
    }
  );
  app.post(
    "/hr/leave-requests",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = LeaveRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      if (parsed.data.endDate < parsed.data.startDate) {
        return reply.status(422).send({ message: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
      }

      const [tenant, user] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findUnique({ where: { id: auth.userId }, select: { fullName: true } })
      ]);

      if (!tenant || !user) {
        return reply.status(404).send({ message: "Data tidak ditemukan" });
      }

      const hrData = readHrData(tenant.additionalData);
      const next: LeaveRequestItem = {
        id: randomUUID(),
        userId: auth.userId,
        userName: user.fullName,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        reason: parsed.data.reason,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      hrData.leaveRequests.unshift(next);

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return reply.status(201).send(next);
    }
  );

  // Endpoint: Owner/Superadmin submit leave for other users
  app.post(
    "/hr/leave-requests/assign",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      // Only owner/superadmin can assign leave for others
      if (!isApprover(auth.role, auth.isSuperAdmin)) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      const AssignLeaveSchema = z.object({
        userId: z.string().uuid(),
        type: z.enum(["leave", "sick"]),
        startDate: z.string().min(10),
        endDate: z.string().min(10),
        reason: z.string().min(3).max(500)
      });
      const parsed = AssignLeaveSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }
      if (parsed.data.endDate < parsed.data.startDate) {
        return reply.status(422).send({ message: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
      }
      const [tenant, user] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { fullName: true } })
      ]);
      if (!tenant || !user) {
        return reply.status(404).send({ message: "Data tidak ditemukan" });
      }
      const hrData = readHrData(tenant.additionalData);
      // Auto-approve if assigned user is owner
      let status: "pending" | "approved" = "pending";
      const assignedUser = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { role: true } });
      if (assignedUser?.role === "owner") {
        status = "approved";
      }
      const next: LeaveRequestItem = {
        id: randomUUID(),
        userId: parsed.data.userId,
        userName: user.fullName,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        reason: parsed.data.reason,
        status,
        note: status === "approved" ? "Auto-approved for owner" : undefined,
        reviewedByUserId: status === "approved" ? auth.userId : undefined,
        reviewedAt: status === "approved" ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString()
      };
      hrData.leaveRequests.unshift(next);
      if (status === "approved") {
        // Update user status if leave is active
        const currentDate = todayDate();
        if (isDateBetween(currentDate, next.startDate, next.endDate)) {
          await prisma.user.update({
            where: { id: next.userId },
            data: {
              conditionStatus: next.type === "leave" ? "on_leave" : "sick",
              attendanceStatus: "off"
            }
          });
        }
      }
      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });
      return reply.status(201).send(next);
    }
  );
  app.get(
    "/hr/leave-requests/approvals",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }


      // Only fetch and return leave requests for approval
      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }
      const query = LeaveListQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }
      const hrData = readHrData(tenant.additionalData);
      const items = hrData.leaveRequests
        .filter((item) => query.data.status ? item.status === query.data.status : true)
        .filter((item) => query.data.type ? item.type === query.data.type : true)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items };
    }
  );

  app.get(
    "/hr/absent-corrections",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const items = hrData.absentCorrections
        .filter((item) => (isApprover(auth.role, auth.isSuperAdmin) ? true : item.userId === auth.userId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return { items };
    }
  );

  app.post(
    "/hr/absent-corrections",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = AbsentCorrectionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      if (!parsed.data.requestedClockIn && !parsed.data.requestedClockOut) {
        return reply.status(422).send({ message: "Isi jam masuk atau jam pulang yang ingin dikoreksi" });
      }

      const [tenant, user] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findUnique({ where: { id: auth.userId }, select: { fullName: true } })
      ]);

      if (!tenant || !user) {
        return reply.status(404).send({ message: "Data tidak ditemukan" });
      }

      const hrData = readHrData(tenant.additionalData);
      const next: AbsentCorrectionItem = {
        id: randomUUID(),
        userId: auth.userId,
        userName: user.fullName,
        date: parsed.data.date,
        requestedClockIn: parsed.data.requestedClockIn,
        requestedClockOut: parsed.data.requestedClockOut,
        reason: parsed.data.reason,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      hrData.absentCorrections.unshift(next);

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return reply.status(201).send(next);
    }
  );

  app.post(
    "/hr/absent-corrections/:id/decision",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      if (!isApprover(auth.role, auth.isSuperAdmin)) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const params = IdParamSchema.safeParse(request.params);
      const body = CorrectionDecisionSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const targetIndex = hrData.absentCorrections.findIndex((item) => item.id === params.data.id);
      if (targetIndex < 0) {
        return reply.status(404).send({ message: "Absent correction not found" });
      }

      const target = hrData.absentCorrections[targetIndex];
      const updated: AbsentCorrectionItem = {
        ...target,
        status: body.data.decision,
        note: body.data.note,
        reviewedByUserId: auth.userId,
        reviewedAt: new Date().toISOString()
      };
      hrData.absentCorrections[targetIndex] = updated;

      if (body.data.decision === "approved") {
        const logIndex = hrData.attendanceLogs.findIndex((log) => log.userId === updated.userId && log.date === updated.date);
        if (logIndex >= 0) {
          hrData.attendanceLogs[logIndex] = {
            ...hrData.attendanceLogs[logIndex],
            ...(updated.requestedClockIn ? { startAt: `${updated.date}T${updated.requestedClockIn}:00.000Z` } : {}),
            ...(updated.requestedClockOut ? { endAt: `${updated.date}T${updated.requestedClockOut}:00.000Z` } : {}),
            status: updated.requestedClockOut ? "completed" : hrData.attendanceLogs[logIndex].status,
            note: `Koreksi absensi disetujui${updated.note ? `: ${updated.note}` : ""}`
          };
        }
      }

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return updated;
    }
  );

  app.get(
    "/hr/attendance/today-status",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const [tenant, me] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findUnique({ where: { id: auth.userId }, select: { conditionStatus: true } })
      ]);

      if (!tenant || !me) {
        return reply.status(404).send({ message: "Data tidak ditemukan" });
      }

      const hrData = readHrData(tenant.additionalData);
      const today = todayDate();
      const todayLog = hrData.attendanceLogs.find((item) => item.userId === auth.userId && item.date === today) ?? null;

      const approvedLeave = hrData.leaveRequests.find((item) => (
        item.userId === auth.userId
        && item.status === "approved"
        && isDateBetween(today, item.startDate, item.endDate)
      ));

      const activeOvertime = hrData.overtimeAssignments.find((item) => (
        item.userId === auth.userId
        && item.date === today
        && item.status === "assigned"
      )) ?? null;

      const blockedByLeave = Boolean(approvedLeave || me.conditionStatus === "on_leave" || me.conditionStatus === "sick");
      const canStartDay = !blockedByLeave && !todayLog;

      return {
        today,
        needsStartDayPopup: canStartDay || blockedByLeave,
        canStartDay,
        blockReason: blockedByLeave ? "Anda sedang on leave / sick" : "",
        todayLog,
        activeOvertime
      };
    }
  );

  app.post(
    "/hr/attendance/start-day",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const [tenant, me] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findUnique({
          where: { id: auth.userId },
          select: { fullName: true, conditionStatus: true, scheduleStartTime: true }
        })
      ]);

      if (!tenant || !me) {
        return reply.status(404).send({ message: "Data tidak ditemukan" });
      }

      const hrData = readHrData(tenant.additionalData);
      const today = todayDate();
      const existing = hrData.attendanceLogs.find((item) => item.userId === auth.userId && item.date === today);
      if (existing) {
        return existing;
      }

      const approvedLeave = hrData.leaveRequests.find((item) => (
        item.userId === auth.userId
        && item.status === "approved"
        && isDateBetween(today, item.startDate, item.endDate)
      ));

      if (approvedLeave || me.conditionStatus === "on_leave" || me.conditionStatus === "sick") {
        return reply.status(422).send({ message: "Anda sedang on leave / sick. Tidak bisa start day." });
      }

      let attendanceStatus: "present" | "late" = "present";
      if (me.scheduleStartTime) {
        const current = currentMinutes();
        const expected = toMinutes(me.scheduleStartTime) + 15;
        if (current > expected) {
          attendanceStatus = "late";
        }
      }

      await prisma.user.update({
        where: { id: auth.userId },
        data: {
          attendanceStatus,
          conditionStatus: "on_duty"
        }
      });

      const now = new Date().toISOString();
      const next: AttendanceLogItem = {
        id: randomUUID(),
        userId: auth.userId,
        userName: me.fullName,
        date: today,
        startAt: now,
        status: "started",
        createdAt: now
      };

      hrData.attendanceLogs.unshift(next);

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return next;
    }
  );

  app.post(
    "/hr/attendance/end-day",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = AttendanceEndSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const today = todayDate();
      const targetIndex = hrData.attendanceLogs.findIndex((item) => item.userId === auth.userId && item.date === today);
      if (targetIndex < 0) {
        return reply.status(404).send({ message: "Start day belum dilakukan" });
      }

      const currentLog = hrData.attendanceLogs[targetIndex];
      if (currentLog.endAt) {
        return currentLog;
      }

      const activeOvertime = hrData.overtimeAssignments.find((item) => (
        item.userId === auth.userId
        && item.date === today
        && item.status === "assigned"
      ));

      if (activeOvertime) {
        const overtimeEnd = toMinutes(activeOvertime.endTime);
        const nowMinute = currentMinutes();

        if (nowMinute < overtimeEnd && !parsed.data.force) {
          return reply.status(409).send({
            message: `Lembur masih berjalan sampai ${activeOvertime.endTime}`,
            requireForce: true,
            overtimeEndTime: activeOvertime.endTime
          });
        }
      }

      const now = new Date().toISOString();
      hrData.attendanceLogs[targetIndex] = {
        ...currentLog,
        endAt: now,
        status: "completed",
        note: activeOvertime ? "End day dengan lembur aktif" : currentLog.note
      };

      if (activeOvertime) {
        const overtimeIndex = hrData.overtimeAssignments.findIndex((item) => item.id === activeOvertime.id);
        if (overtimeIndex >= 0) {
          hrData.overtimeAssignments[overtimeIndex] = {
            ...hrData.overtimeAssignments[overtimeIndex],
            status: "completed",
            updatedAt: now
          };
        }
      }

      await prisma.user.update({
        where: { id: auth.userId },
        data: {
          attendanceStatus: "off"
        }
      });

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return hrData.attendanceLogs[targetIndex];
    }
  );

  app.get(
    "/hr/attendance/history",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = AttendanceListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const canSeeAll = isApprover(auth.role, auth.isSuperAdmin);

      const baseItems = hrData.attendanceLogs
        .filter((item) => canSeeAll ? true : item.userId === auth.userId)
        .filter((item) => parsed.data.userId ? item.userId === parsed.data.userId : true)
        .filter((item) => parsed.data.date ? item.date === parsed.data.date : true)
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));

      const startIndex = (parsed.data.page - 1) * parsed.data.pageSize;
      const items = baseItems.slice(startIndex, startIndex + parsed.data.pageSize);

      return {
        items,
        pagination: {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          total: baseItems.length,
          totalPages: Math.max(Math.ceil(baseItems.length / parsed.data.pageSize), 1)
        }
      };
    }
  );

  app.get(
    "/hr/overtime",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = OvertimeListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const canSeeAll = isApprover(auth.role, auth.isSuperAdmin);
      const items = hrData.overtimeAssignments
        .filter((item) => canSeeAll ? true : item.userId === auth.userId)
        .filter((item) => parsed.data.status ? item.status === parsed.data.status : true)
        .filter((item) => parsed.data.userId ? item.userId === parsed.data.userId : true)
        .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));

      return { items };
    }
  );

  app.post(
    "/hr/overtime",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      if (!isApprover(auth.role, auth.isSuperAdmin)) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const parsed = OvertimeAssignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      if (toMinutes(parsed.data.endTime) <= toMinutes(parsed.data.startTime)) {
        return reply.status(422).send({ message: "Jam selesai lembur harus lebih besar dari jam mulai" });
      }

      const [tenant, user] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
        prisma.user.findFirst({
          where: {
            id: parsed.data.userId,
            ...(auth.isSuperAdmin ? {} : { tenantId: auth.tenantId })
          },
          select: { id: true, fullName: true }
        })
      ]);

      if (!tenant || !user) {
        return reply.status(404).send({ message: "Tenant/User tidak ditemukan" });
      }

      const hrData = readHrData(tenant.additionalData);
      const now = new Date().toISOString();
      const next: OvertimeAssignmentItem = {
        id: randomUUID(),
        userId: user.id,
        userName: user.fullName,
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        note: parsed.data.note,
        status: "assigned",
        assignedByUserId: auth.userId,
        createdAt: now,
        updatedAt: now
      };

      hrData.overtimeAssignments.unshift(next);

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return reply.status(201).send(next);
    }
  );

  app.patch(
    "/hr/overtime/:id/status",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth?.tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      if (!isApprover(auth.role, auth.isSuperAdmin)) {
        return reply.status(403).send({ message: "Forbidden" });
    // Endpoint: Owner/Superadmin submit leave for other users
    app.post(
      "/hr/leave-requests/assign",
      { preHandler: [requireAuth, requireActiveSubscription] },
      async (request, reply) => {
        const auth = request.auth;
        if (!auth?.tenantId) {
          return reply.status(401).send({ message: "Unauthorized" });
        }
        // Only owner/superadmin can assign leave for others
        if (!isApprover(auth.role, auth.isSuperAdmin)) {
          return reply.status(403).send({ message: "Forbidden" });
        }
        const AssignLeaveSchema = z.object({
          userId: z.string().uuid(),
          type: z.enum(["leave", "sick"]),
          startDate: z.string().min(10),
          endDate: z.string().min(10),
          reason: z.string().min(3).max(500)
        });
        const parsed = AssignLeaveSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ message: "Invalid payload" });
        }
        if (parsed.data.endDate < parsed.data.startDate) {
          return reply.status(422).send({ message: "Tanggal selesai tidak boleh sebelum tanggal mulai" });
        }
        const [tenant, user] = await Promise.all([
          prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } }),
          prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { fullName: true } })
        ]);
        if (!tenant || !user) {
          return reply.status(404).send({ message: "Data tidak ditemukan" });
        }
        const hrData = readHrData(tenant.additionalData);
        // Auto-approve if assigned user is owner
        let status: "pending" | "approved" = "pending";
        const assignedUser = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { role: true } });
        if (assignedUser?.role === "owner") {
          status = "approved";
        }
        const next: LeaveRequestItem = {
          id: randomUUID(),
          userId: parsed.data.userId,
          userName: user.fullName,
          type: parsed.data.type,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          reason: parsed.data.reason,
          status,
          note: status === "approved" ? "Auto-approved for owner" : undefined,
          reviewedByUserId: status === "approved" ? auth.userId : undefined,
          reviewedAt: status === "approved" ? new Date().toISOString() : undefined,
          createdAt: new Date().toISOString()
        };
        hrData.leaveRequests.unshift(next);
        if (status === "approved") {
          // Update user status if leave is active
          const currentDate = todayDate();
          if (isDateBetween(currentDate, next.startDate, next.endDate)) {
            await prisma.user.update({
              where: { id: next.userId },
              data: {
                conditionStatus: next.type === "leave" ? "on_leave" : "sick",
                attendanceStatus: "off"
              }
            });
          }
        }
        await prisma.tenant.update({
          where: { id: auth.tenantId },
          data: {
            additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
          }
        });
        return reply.status(201).send(next);
      }
    );
      }

      const params = IdParamSchema.safeParse(request.params);
      const body = OvertimeStatusSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { additionalData: true } });
      if (!tenant) {
        return reply.status(404).send({ message: "Tenant not found" });
      }

      const hrData = readHrData(tenant.additionalData);
      const index = hrData.overtimeAssignments.findIndex((item) => item.id === params.data.id);
      if (index < 0) {
        return reply.status(404).send({ message: "Overtime assignment not found" });
      }

      hrData.overtimeAssignments[index] = {
        ...hrData.overtimeAssignments[index],
        status: body.data.status,
        updatedAt: new Date().toISOString()
      };

      await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: {
          additionalData: writeHrData(tenant.additionalData, hrData) as unknown as object
        }
      });

      return hrData.overtimeAssignments[index];
    }
  );
}
