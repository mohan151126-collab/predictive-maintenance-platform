import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../../.env"),
  quiet: true,
});

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
