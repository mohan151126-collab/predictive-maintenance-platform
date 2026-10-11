import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  await mongoose.connect(config.MONGO_URI);
  console.log("MongoDB connected");
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
