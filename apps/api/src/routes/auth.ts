import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { Organization } from "../models/organization.js";
import { User } from "../models/user.js";

const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(72),
});

function isDuplicateKeyError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === 11000
  );
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
