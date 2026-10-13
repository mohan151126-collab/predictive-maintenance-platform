# Predictive Maintenance Platform

Real-time monitoring and failure prediction for manufacturing equipment. Sensors send readings, the system checks them against each sensor's limits, scores every machine's health, raises alerts and tracks the maintenance work that follows.

## Requirements

- Node.js 22 or newer and pnpm 9
- Docker Desktop (WSL 2 engine)
- JDK 21 (Eclipse Temurin) for the two Spring Boot services

## First time only

```
pnpm install
cp .env.example .env
```

Then open `.env` and replace the placeholder secrets. Generate each JWT secret with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Start everything with one command

Open Docker Desktop first and wait for "Engine running". Then, from the project folder:

```
pnpm start:all
```

This starts the database, Kafka and MQTT broker, then the API, the web app, the simulator and both Java services, with one colour-coded log. Press `Ctrl + C` once to stop all of them.

| Command | What it starts |
|---|---|
| `pnpm start:all` | Everything |
| `pnpm start:core` | Everything except the two Java services (no health scores or alerts) |
| `pnpm start:all --fault "CNC Lathe 1=vibration" --speed 6` | Everything, with a developing fault on a machine, 6 times faster than real time |

Open http://localhost:5173 once it says so. The Java services need about a minute before health scores appear.

## What runs where

| Part | Technology | Port |
|---|---|---|
| Web app | React 18, TypeScript, Vite | 5173 |
| API | Node, Express, TypeScript, MongoDB, Socket.IO | 4000 |
| Ingestion | Spring Boot 4, Java 21 | 8082 |
| Analytics | Spring Boot 4, Java 21 | 8083 |
| Simulator | Node, TypeScript | none |
| MongoDB, Kafka, MQTT broker, Kafka UI | Docker | 27017, 9092, 1883, 8090 |

## How the data flows

```
simulator --MQTT--> ingestion --Kafka telemetry.raw--> analytics --Kafka alerts, machine.health--> API --Socket.IO--> browser
                       |                                  |
                       +--> telemetry.deadletter          +--> MongoDB time-series history
```

The message formats are defined once in `contracts/` and checked by tests in every service.

## Tests

```
pnpm --filter @pm/api test                       # API: 95 tests, needs Docker running
cd services/ingestion && ./gradlew.bat test      # ingestion
cd services/analytics && ./gradlew.bat test      # analytics
```
