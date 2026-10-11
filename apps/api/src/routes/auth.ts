import bcrypt from "bcryptjs";
import { Router, type Response } from "express";
import { z } from "zod";
import {
  REFRESH_COOKIE,
  REFRESH_MAX_AGE_MS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from "../auth/tokens.js";
import { Organization } from "../models/organization.js";
import { User, type Role } from "../models/user.js";

const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(72),
});

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/auth",
} as const;

function isDuplicateKeyError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === 11000
  );
}

function payloadFor(user: {
  id: string;
  orgId: { toString(): string };
  role: string;
}): TokenPayload {
  return {
    sub: user.id,
    orgId: user.orgId.toString(),
    role: user.role as Role,
  };
}

function setRefreshCookie(res: Response, payload: TokenPayload) {
  res.cookie(REFRESH_COOKIE, signRefreshToken(payload), {
    ...cookieOptions,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { organizationName, email, password } = parsed.data;

  if (await User.exists({ email })) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const org = await Organization.create({ name: organizationName });

  try {
    const user = await User.create({
      orgId: org._id,
      email,
      passwordHash,
      role: "admin",
    });
    res
      .status(201)
      .json({ id: user.id, email: user.email, role: user.role, orgId: org.id });
  } catch (err) {
    await Organization.deleteOne({ _id: org._id });
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email });
  const passwordOk = await bcrypt.compare(
    password,
    user ? user.passwordHash : DUMMY_HASH,
  );
  if (!user || !passwordOk) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const payload = payloadFor(user);
  setRefreshCookie(res, payload);
  res.json({
    accessToken: signAccessToken(payload),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: payload.orgId,
    },
  });
});

authRouter.post("/refresh", async (req, res) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== "string") {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  let sub: string;
  try {
    sub = verifyRefreshToken(token).sub;
  } catch {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  const user = await User.findById(sub);
  if (!user) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  const payload = payloadFor(user);
  setRefreshCookie(res, payload);
  res.json({ accessToken: signAccessToken(payload) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});
