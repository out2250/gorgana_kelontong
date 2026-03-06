import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

import { env } from "./env";

export type AccessTokenPayload = {
  userId: string;
  tenantId: string;
  role: "owner" | "manager" | "cashier";
  isSuperAdmin?: boolean;
};

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtAccessTtl as SignOptions["expiresIn"]
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  return decoded as AccessTokenPayload;
}

export function getAccessTokenExpiresAt(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) {
    throw new Error("Invalid access token expiration");
  }

  return new Date(decoded.exp * 1000);
}
