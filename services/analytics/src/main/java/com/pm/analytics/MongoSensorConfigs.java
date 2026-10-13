package com.pm.analytics;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
class MongoSensorConfigs implements SensorConfigs {

    private static final Logger log = LoggerFactory.getLogger(MongoSensorConfigs.class);

    private final MongoTemplate mongo;
    private volatile Map<String, SensorConfig> bySensor = Map.of();
    private volatile Map<String, List<SensorConfig>> byMachine = Map.of();

    MongoSensorConfigs(MongoTemplate mongo) {
        this.mongo = mongo;
        refresh();
    }

    @Scheduled(fixedDelay = 30_000, initialDelay = 30_000)
    void refresh() {
        try {
            List<SensorConfig> loaded = mongo.findAll(Document.class, "sensors").stream()
                    .map(MongoSensorConfigs::toConfig)
                    .flatMap(Optional::stream)
                    .toList();
            bySensor = loaded.stream().collect(Collectors.toUnmodifiableMap(SensorConfig::sensorId, c -> c));
            byMachine = loaded.stream().collect(Collectors.groupingBy(SensorConfig::machineId));
            log.info("Loaded configuration of {} sensors", loaded.size());
        } catch (RuntimeException e) {
            log.warn("Could not refresh the sensor configuration, keeping the previous one", e);
        }
    }

    @Override
    public Optional<SensorConfig> find(String sensorId) {
        return Optional.ofNullable(bySensor.get(sensorId));
    }

    @Override
    public List<SensorConfig> forMachine(String machineId) {
        return byMachine.getOrDefault(machineId, List.of());
    }

    static Optional<SensorConfig> toConfig(Document doc) {
        try {
            Document thresholds = doc.get("thresholds", Document.class);
            return Optional.of(new SensorConfig(
                    doc.getObjectId("_id").toHexString(),
                    doc.getObjectId("orgId").toHexString(),
                    doc.getObjectId("machineId").toHexString(),
                    doc.getString("name"),
                    doc.getString("unit"),
                    ((Number) doc.get("samplingHz")).doubleValue(),
                    number(thresholds, "min"),
                    number(thresholds, "max"),
                    number(thresholds, "rateOfChange")));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private static Double number(Document thresholds, String key) {
        if (thresholds == null) {
            return null;
        }
        return thresholds.get(key) instanceof Number n ? n.doubleValue() : null;
    }
}
