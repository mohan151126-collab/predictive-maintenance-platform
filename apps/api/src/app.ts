import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { alertsRouter } from "./routes/alerts.js";
import { authRouter } from "./routes/auth.js";
import { machinesRouter } from "./routes/machines.js";
import { meRouter } from "./routes/me.js";
import { plantsRouter } from "./routes/plants.js";
import { sensorsRouter } from "./routes/sensors.js";
import { usersRouter } from "./routes/users.js";
import { workOrdersRouter } from "./routes/workOrders.js";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/plants", plantsRouter);
  app.use("/api/machines", machinesRouter);
  app.use("/api/sensors", sensorsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/work-orders", workOrdersRouter);
  app.use("/api/users", usersRouter);

  app.use(errorHandler);

  return app;
}
