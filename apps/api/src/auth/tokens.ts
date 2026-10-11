import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { Role } from "../models/user.js";

export interface TokenPayload {
  sub: string;
  orgId: string;
  role: Role;
}

export const REFRESH_COOKIE = "refresh_token";
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: "15m",
  });
}

export function signRefreshToken(payload: TokenPayload) {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload & TokenPayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload & TokenPayload;
}
