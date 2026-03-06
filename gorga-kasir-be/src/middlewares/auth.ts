import { FastifyReply, FastifyRequest } from "fastify";

import { verifyAccessToken } from "../lib/jwt";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ message: "Unauthorized" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    request.auth = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({ message: "Invalid token" });
  }
}
