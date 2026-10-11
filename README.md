# Predictive Maintenance Platform

Real-time monitoring and failure prediction for manufacturing equipment.

## Requirements

- Node.js 22+
- pnpm 9
- Docker Desktop (WSL 2 engine)

## Start local infrastructure

```
cp .env.example .env
pnpm infra:up
pnpm infra:ps
```

| Service   | Address                |
|-----------|------------------------|
| MongoDB   | localhost:27017        |
| Kafka     | localhost:9092         |
| Kafka UI  | http://localhost:8090  |
| Mosquitto | localhost:1883         |
