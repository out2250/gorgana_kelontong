import { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../lib/prisma";

export async function requireActiveSubscription(request: FastifyRequest, reply: FastifyReply) {
  if (request.auth?.isSuperAdmin) {
    return;
  }

  if (!request.auth?.tenantId) {
    return reply.status(401).send({ message: "Unauthorized" });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: request.auth.tenantId },
    select: { status: true }
  });

  if (!tenant || tenant.status !== "active") {
    return reply.status(403).send({ message: "Tenant inactive" });
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId: request.auth.tenantId
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const allowedStatus = subscription && ["active", "trial"].includes(subscription.status);
  const paymentSatisfied = subscription && (subscription.status === "trial" || subscription.paymentStatus === "paid");
  const expired = Boolean(subscription?.endsAt && new Date(subscription.endsAt).getTime() < Date.now());

  if (!subscription || !allowedStatus || !paymentSatisfied || expired) {
    return reply.status(403).send({ message: expired ? "Subscription expired" : "Subscription inactive" });
  }
}
