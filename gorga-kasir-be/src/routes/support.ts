import { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { requireAuth } from "../middlewares/auth";
import { requireRoles } from "../middlewares/roles";
import { requireActiveSubscription } from "../middlewares/subscription";

const CreateTicketSchema = z.object({
  storeId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(5),
  priority: z.string().default("normal")
});

const UpdateTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"])
});

const ListTicketQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  storeId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  priority: z.string().optional()
});

export async function supportRoutes(app: FastifyInstance) {
  app.get(
    "/support/tickets",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const query = ListTicketQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ message: "Invalid query" });
      }

      const { page, pageSize, storeId, search, status, priority } = query.data;
      const skip = (page - 1) * pageSize;

      const where = {
        tenantId,
        ...(storeId ? { storeId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(search
          ? {
              title: {
                contains: search,
                mode: "insensitive" as const
              }
            }
          : {})
      };

      const [total, tickets] = await Promise.all([
        prisma.supportTicket.count({ where }),
        prisma.supportTicket.findMany({
          where,
          include: {
            store: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true } }
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize
        })
      ]);

      return {
        items: tickets,
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
    "/support/tickets",
    { preHandler: [requireAuth, requireActiveSubscription] },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const parsed = CreateTicketSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const hasStore = await prisma.store.findFirst({
        where: { id: parsed.data.storeId, tenantId: auth.tenantId }
      });

      if (!hasStore) {
        return reply.status(403).send({ message: "Store access denied" });
      }

      const ticket = await prisma.supportTicket.create({
        data: {
          tenantId: auth.tenantId,
          storeId: parsed.data.storeId,
          openedBy: auth.userId,
          title: parsed.data.title,
          description: parsed.data.description,
          priority: parsed.data.priority,
          status: "open"
        }
      });

      return reply.status(201).send(ticket);
    }
  );

  app.patch(
    "/support/tickets/:id/status",
    { preHandler: [requireAuth, requireActiveSubscription, requireRoles("owner", "manager")] },
    async (request, reply) => {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const parsed = UpdateTicketSchema.safeParse(request.body);

      if (!params.success || !parsed.success) {
        return reply.status(400).send({ message: "Invalid payload" });
      }

      const updated = await prisma.supportTicket.updateMany({
        where: {
          id: params.data.id,
          tenantId
        },
        data: {
          status: parsed.data.status
        }
      });

      if (updated.count === 0) {
        return reply.status(404).send({ message: "Ticket not found" });
      }

      const ticket = await prisma.supportTicket.findUnique({
        where: { id: params.data.id }
      });

      return ticket;
    }
  );
}
