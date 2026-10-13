import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipJava = args.includes("--no-java");
const simulatorArgs = args.filter((arg) => arg !== "--no-java");

const COLORS = { start: 37, api: 32, web: 36, simulator: 33, ingestion: 34, analytics: 31 };
const children = [];
let stopping = false;

function log(name, text) {
  const color = COLORS[name] ?? 37;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) console.log(`\x1b[${color}m[${name}]\x1b[0m ${line}`);
  }
}

function run(name, command, commandArgs, cwd = root) {
  const child = spawn(command, commandArgs, { cwd, shell: true, windowsHide: true });
  children.push(child);
  child.stdout.on("data", (data) => log(name, data));
  child.stderr.on("data", (data) => log(name, data));
  child.on("exit", (code) => {
    if (!stopping) log(name, `stopped with exit code ${code}`);
  });
  return child;
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping everything...");
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  console.log("Stopped. The database and message services keep running; stop them with: pnpm infra:down");
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) return false;
    if (await check()) return true;
    await sleep(1500);
  }
  log("start", `Gave up waiting for ${label}`);
  return false;
}

const isHealthy = (container) => () => {
  const result = spawnSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", container], {
    encoding: "utf8",
  });
  return result.stdout.trim() === "healthy";
};

const answers = (url) => async () => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

async function main() {
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    console.error("Docker is not running. Open Docker Desktop, wait for 'Engine running', then try again.");
    process.exit(1);
  }

  const busy = [];
  const needed = [4000, 5173, ...(skipJava ? [] : [8082, 8083])];
  for (const port of needed) if (await portInUse(port)) busy.push(port);
  if (busy.length > 0) {
    console.error(
      `Port(s) ${busy.join(", ")} already in use. Close the programs using them (an old terminal of this project?) and try again.`,
    );
    process.exit(1);
  }

  log("start", "Starting the database, Kafka and MQTT broker...");
  const up = spawnSync("docker", ["compose", "up", "-d"], { cwd: root, encoding: "utf8" });
  if (up.status !== 0) {
    console.error(up.stderr || up.stdout);
    process.exit(1);
  }
  const ready =
    (await waitFor("MongoDB", isHealthy("predictive-maintenance-mongo-1"), 120_000)) &&
    (await waitFor("Kafka", isHealthy("predictive-maintenance-kafka-1"), 120_000));
  if (!ready) {
    stopAll();
    return;
  }
  log("start", "Database and Kafka are healthy.");

  run("api", "pnpm", ["--filter", "@pm/api", "dev"]);
  run("web", "pnpm", ["--filter", "@pm/web", "dev"]);

  if (!skipJava) {
    run("ingestion", "gradlew.bat", ["bootRun"], path.join(root, "services", "ingestion"));
    await sleep(3000);
    run("analytics", "gradlew.bat", ["bootRun"], path.join(root, "services", "analytics"));
  }

  if (await waitFor("the API", answers("http://localhost:4000/health"), 90_000)) {
    run("simulator", "pnpm", ["--filter", "@pm/simulator", "start", ...simulatorArgs]);
  }

  await waitFor("the web app", answers("http://localhost:5173/"), 90_000);
  console.log("\n  Open http://localhost:5173 in your browser.");
  console.log(skipJava ? "  (Java services skipped: no health scores or alerts.)" : "  The Java services need about a minute before health scores appear.");
  console.log("  Press Ctrl + C in this window to stop everything.\n");
}

main().catch((error) => {
  console.error(error);
  stopAll();
});
