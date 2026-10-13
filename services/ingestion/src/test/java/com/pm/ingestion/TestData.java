package com.pm.ingestion;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

final class TestData {

    static final JsonMapper MAPPER = JsonMapper.builder().build();

    private TestData() {}

    static ObjectNode example() {
        try (InputStream in = TestData.class.getResourceAsStream("/telemetry.example.json")) {
            return (ObjectNode) MAPPER.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String topicFor(ObjectNode message) {
        return "plant/%s/machine/%s/sensor/%s"
                .formatted(
                        message.get("plantId").asString(),
                        message.get("machineId").asString(),
                        message.get("sensorId").asString());
    }
}
