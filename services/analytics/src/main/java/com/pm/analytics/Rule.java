package com.pm.analytics;

import com.fasterxml.jackson.annotation.JsonValue;

public enum Rule {
    MAX_EXCEEDED("max_exceeded"),
    MIN_EXCEEDED("min_exceeded"),
    RATE_OF_CHANGE("rate_of_change"),
    SENSOR_OFFLINE("sensor_offline");

    private final String wireName;

    Rule(String wireName) {
        this.wireName = wireName;
    }

    @JsonValue
    public String wireName() {
        return wireName;
    }
}
