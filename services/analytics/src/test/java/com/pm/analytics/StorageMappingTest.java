package com.pm.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Date;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;

class StorageMappingTest {

    private static final ObjectId SENSOR_ID = new ObjectId("6acbb105eed04b44409d2547");
    private static final ObjectId ORG_ID = new ObjectId("6acb97418f15672ff985c5ef");
    private static final ObjectId MACHINE_ID = new ObjectId("6acba4c1b8f3bc79fe53fcb9");

    private static Document sensorDocument() {
        return new Document("_id", SENSOR_ID)
                .append("orgId", ORG_ID)
                .append("machineId", MACHINE_ID)
                .append("name", "Spindle vibration")
                .append("type", "vibration_rms")
                .append("unit", "mm/s")
                .append("samplingHz", 1);
    }

    @Test
    void mapsASensorWithAllLimits() {
        Document doc = sensorDocument().append("thresholds", new Document("min", 1).append("max", 9.5).append("rateOfChange", 2));

        SensorConfig config = MongoSensorConfigs.toConfig(doc).orElseThrow();

        assertThat(config.sensorId()).isEqualTo("6acbb105eed04b44409d2547");
        assertThat(config.orgId()).isEqualTo("6acb97418f15672ff985c5ef");
        assertThat(config.machineId()).isEqualTo("6acba4c1b8f3bc79fe53fcb9");
        assertThat(config.name()).isEqualTo("Spindle vibration");
        assertThat(config.unit()).isEqualTo("mm/s");
        assertThat(config.samplingHz()).isEqualTo(1.0);
        assertThat(config.min()).isEqualTo(1.0);
        assertThat(config.max()).isEqualTo(9.5);
        assertThat(config.rateOfChangePerMinute()).isEqualTo(2.0);
        assertThat(config.hasRules()).isTrue();
    }

    @Test
    void mapsASensorWithOnlyOneLimit() {
        SensorConfig config =
                MongoSensorConfigs.toConfig(sensorDocument().append("thresholds", new Document("max", 90))).orElseThrow();

        assertThat(config.min()).isNull();
        assertThat(config.max()).isEqualTo(90.0);
        assertThat(config.rateOfChangePerMinute()).isNull();
    }

    @Test
    void mapsASensorWithoutAThresholdsObject() {
        SensorConfig config = MongoSensorConfigs.toConfig(sensorDocument()).orElseThrow();

        assertThat(config.hasRules()).isFalse();
    }

    @Test
    void skipsADocumentThatIsMissingRequiredFields() {
        assertThat(MongoSensorConfigs.toConfig(new Document("_id", SENSOR_ID))).isEmpty();
    }

    @Test
    void buildsATimeSeriesDocumentForAReading() {
        Reading reading = new Reading(
                "6acb97418f15672ff985c5ef",
                "6acba134ed0ec5f5a756b95d",
                "6acba4c1b8f3bc79fe53fcb9",
                "6acbb105eed04b44409d2547",
                "vibration_rms",
                "mm/s",
                4.31,
                Instant.parse("2026-10-13T09:15:02.120Z"));

        Document doc = TelemetryStore.toDocument(reading);

        assertThat(doc.get("ts")).isEqualTo(Date.from(reading.ts()));
        assertThat(doc.getDouble("value")).isEqualTo(4.31);
        Document meta = doc.get("meta", Document.class);
        assertThat(meta.keySet()).containsExactly("orgId", "plantId", "machineId", "sensorId", "type");
        assertThat(meta.getString("machineId")).isEqualTo("6acba4c1b8f3bc79fe53fcb9");
    }
}
