import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { User } from "../models/user.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.auth?.sub);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId.toString(),
  });
});
