package com.pm.analytics;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class Monitor {

    public interface EventSink {
        void alert(AlertEvent event);

        void health(HealthEvent event);
    }

    private static final Duration HEARTBEAT = Duration.ofSeconds(60);

    private static final class MachineInfo {
        final String orgId;
        final String plantId;
        HealthEvent lastPublished;
        Instant lastPublishedAt;

        MachineInfo(String orgId, String plantId) {
            this.orgId = orgId;
            this.plantId = plantId;
        }
    }

    private final SensorConfigs configs;
    private final EventSink sink;
    private final Clock clock;
    private final RuleEngine rules = new RuleEngine();
    private final HealthCalculator health = new HealthCalculator();
    private final Map<String, SensorState> sensors = new HashMap<>();
    private final Map<String, MachineInfo> machines = new HashMap<>();

    public Monitor(SensorConfigs configs, EventSink sink, Clock clock) {
        this.configs = configs;
        this.sink = sink;
        this.clock = clock;
    }

    public synchronized void onReading(Reading reading) {
        Optional<SensorConfig> config = configs.find(reading.sensorId());
        if (config.isEmpty()) {
            return;
        }
        machines.computeIfAbsent(
                reading.machineId(), id -> new MachineInfo(reading.orgId(), reading.plantId()));
        SensorState state = sensors.computeIfAbsent(reading.sensorId(), id -> new SensorState());
        rules.onReading(reading, config.get(), state, clock.instant()).forEach(sink::alert);
    }

    public synchronized void tick() {
        Instant now = clock.instant();

        for (Map.Entry<String, SensorState> entry : sensors.entrySet()) {
            configs.find(entry.getKey())
                    .ifPresent(config ->
                            rules.checkOffline(config, entry.getValue(), now).forEach(sink::alert));
        }

        for (Map.Entry<String, MachineInfo> entry : machines.entrySet()) {
            publishHealth(entry.getKey(), entry.getValue(), now);
        }
    }

    private void publishHealth(String machineId, MachineInfo machine, Instant now) {
        List<HealthCalculator.SensorView> views = configs.forMachine(machineId).stream()
                .filter(config -> sensors.containsKey(config.sensorId()))
                .map(config -> new HealthCalculator.SensorView(config, sensors.get(config.sensorId())))
                .toList();

        HealthEvent event = health.compute(machine.orgId, machine.plantId, machineId, views, now);

        boolean changed = machine.lastPublished == null
                || !Objects.equals(event.status(), machine.lastPublished.status())
                || !Objects.equals(event.healthScore(), machine.lastPublished.healthScore());
        boolean heartbeatDue = machine.lastPublishedAt == null
                || Duration.between(machine.lastPublishedAt, now).compareTo(HEARTBEAT) >= 0;

        if (changed || heartbeatDue) {
            sink.health(event);
            machine.lastPublished = event;
            machine.lastPublishedAt = now;
        }
    }
}
