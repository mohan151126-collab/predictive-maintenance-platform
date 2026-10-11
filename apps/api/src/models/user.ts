import { Schema, model } from "mongoose";

export const ROLES = ["admin", "manager", "technician", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);

export const User = model("User", userSchema);
