import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { startKafkaBridge } from "./realtime/consumer.js";
import { attachSocketServer } from "./realtime/socket.js";

await connectDb();

const httpServer = createServer(createApp());
const sockets = attachSocketServer(httpServer, "http://localhost:5173");
const bridge = startKafkaBridge({
  brokers: config.KAFKA_BROKERS.split(","),
  hub: sockets.hub,
});

httpServer.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

async function shutdown() {
  await bridge.stop();
  await sockets.close();
  httpServer.close();
  await disconnectDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
