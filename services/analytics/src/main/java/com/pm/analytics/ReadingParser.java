package com.pm.analytics;

import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
class ReadingParser {

    private final JsonMapper mapper;

    ReadingParser(JsonMapper mapper) {
        this.mapper = mapper;
    }

    Optional<Reading> parse(String json) {
        try {
            JsonNode node = mapper.readTree(json);
            JsonNode value = node.get("value");
            if (value == null || !value.isNumber()) {
                return Optional.empty();
            }
            return Optional.of(new Reading(
                    text(node, "orgId"),
                    text(node, "plantId"),
                    text(node, "machineId"),
                    text(node, "sensorId"),
                    text(node, "type"),
                    text(node, "unit"),
                    value.doubleValue(),
                    Instant.parse(text(node, "ts"))));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString()) {
            throw new IllegalArgumentException("missing text field " + field);
        }
        return value.asString();
    }
}
