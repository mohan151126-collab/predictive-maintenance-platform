import bcrypt from "bcryptjs";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { isDuplicateKeyError } from "../lib/mongo-errors.js";
import { ROLES, User } from "../models/user.js";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(ROLES),
  password: z.string().min(8).max(72),
});

const updateSchema = z.object({ role: z.enum(ROLES) });

function toDto(user: { id: string; email: string; role: string; createdAt: Date }) {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", requireRole("admin", "manager"), async (req, res) => {
  const { orgId } = req.auth!;
  const users = await User.find({ orgId }).sort({ email: 1 });
  res.json(users.map(toDto));
});

usersRouter.post("/", requireRole("admin"), async (req, res) => {
  const { orgId } = req.auth!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { email, role, password } = parsed.data;

  try {
    const user = await User.create({
      orgId,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json(toDto(user));
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    throw err;
  }
});

usersRouter.patch("/:id", requireRole("admin"), async (req, res) => {
  const { orgId, sub } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (id === sub) {
    res.status(409).json({ error: "You cannot change your own role" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }

  const user = await User.findOneAndUpdate({ _id: id, orgId }, parsed.data, {
    returnDocument: "after",
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toDto(user));
});
