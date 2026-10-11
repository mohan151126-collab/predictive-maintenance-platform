import type { RequestHandler } from "express";
import type { Role } from "../models/user.js";
import { verifyAccessToken, type TokenPayload } from "./tokens.js";

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }

  try {
    const { sub, orgId, role } = verifyAccessToken(header.slice(7));
    req.auth = { sub, orgId, role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
