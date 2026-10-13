package com.pm.analytics;

import java.time.Instant;

final class Fixtures {

    static final String ORG = "6acb97418f15672ff985c5ef";
    static final String PLANT = "6acba134ed0ec5f5a756b95d";
    static final String MACHINE = "6acba4c1b8f3bc79fe53fcb9";
    static final String SENSOR = "6acbb105eed04b44409d2547";
    static final String OTHER_SENSOR = "6acbb346eed04b44409d2549";
    static final Instant T0 = Instant.parse("2026-10-13T10:00:00Z");

    private Fixtures() {}

    static SensorConfig config(String sensorId, String name, Double min, Double max, Double rate) {
        return new SensorConfig(sensorId, ORG, MACHINE, name, "mm/s", 1.0, min, max, rate);
    }

    static SensorConfig config(Double min, Double max, Double rate) {
        return config(SENSOR, "Spindle vibration", min, max, rate);
    }

    static Reading reading(String sensorId, double value, long secondsAfterStart) {
        return new Reading(
                ORG, PLANT, MACHINE, sensorId, "vibration_rms", "mm/s", value, T0.plusSeconds(secondsAfterStart));
    }

    static Reading reading(double value, long secondsAfterStart) {
        return reading(SENSOR, value, secondsAfterStart);
    }

    static SensorState stateWith(double lastValue) {
        SensorState state = new SensorState();
        state.plantId = PLANT;
        state.lastValue = lastValue;
        state.lastSeen = T0;
        return state;
    }
}
