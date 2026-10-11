import { Schema, model } from "mongoose";

const plantSchema = new Schema(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    timezone: { type: String, required: true, default: "UTC" },
  },
  { timestamps: true },
);

plantSchema.index({ orgId: 1, name: 1 }, { unique: true });

export const Plant = model("Plant", plantSchema);
