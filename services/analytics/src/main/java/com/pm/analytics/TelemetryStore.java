package com.pm.analytics;

import java.time.Duration;
import java.util.Date;
import java.util.List;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.CollectionOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.timeseries.Granularity;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
class TelemetryStore {

    static final String COLLECTION = "telemetry";
    private static final Duration RETENTION = Duration.ofDays(30);
    private static final Logger log = LoggerFactory.getLogger(TelemetryStore.class);

    private final MongoTemplate mongo;
    private volatile boolean collectionReady;

    TelemetryStore(MongoTemplate mongo) {
        this.mongo = mongo;
        try {
            ensureCollection();
        } catch (RuntimeException e) {
            log.warn("Could not prepare the {} collection yet, will retry when the first reading arrives", COLLECTION, e);
        }
    }

    void saveAll(List<Reading> readings) {
        if (readings.isEmpty()) {
            return;
        }
        ensureCollection();
        mongo.insert(readings.stream().map(TelemetryStore::toDocument).toList(), COLLECTION);
    }

    private void ensureCollection() {
        if (collectionReady) {
            return;
        }
        if (!mongo.collectionExists(COLLECTION)) {
            mongo.createCollection(
                    COLLECTION,
                    CollectionOptions.timeSeries(
                            "ts",
                            options -> options
                                    .metaField("meta")
                                    .granularity(Granularity.SECONDS)
                                    .expireAfter(RETENTION)));
        }
        collectionReady = true;
    }

    static Document toDocument(Reading reading) {
        return new Document("ts", Date.from(reading.ts()))
                .append(
                        "meta",
                        new Document("orgId", reading.orgId())
                                .append("plantId", reading.plantId())
                                .append("machineId", reading.machineId())
                                .append("sensorId", reading.sensorId())
                                .append("type", reading.type()))
                .append("value", reading.value());
    }
}
