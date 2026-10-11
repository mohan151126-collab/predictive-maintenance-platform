import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
