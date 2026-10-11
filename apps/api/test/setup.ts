import path from "node:path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../../.env"),
  quiet: true,
});

const uri = new URL(process.env.MONGO_URI ?? "");
uri.pathname = "/predictive_maintenance_test";
process.env.MONGO_URI = uri.toString();

if (!new URL(process.env.MONGO_URI).pathname.endsWith("_test")) {
  throw new Error("Refusing to run tests against a non-test database");
}
