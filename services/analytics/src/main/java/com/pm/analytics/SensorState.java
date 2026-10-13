package com.pm.analytics;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.EnumMap;
import java.util.Map;

final class SensorState {

    record Point(Instant ts, double value) {}

    static final class ActiveCondition {
        final String severity;
        int clearStreak;

        ActiveCondition(String severity) {
            this.severity = severity;
        }
    }

    final Deque<Point> window = new ArrayDeque<>();
    final Map<Rule, ActiveCondition> active = new EnumMap<>(Rule.class);
    String plantId;
    Double lastValue;
    Instant lastSeen;
}
