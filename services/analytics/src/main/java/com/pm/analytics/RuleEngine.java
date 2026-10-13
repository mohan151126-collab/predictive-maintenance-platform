package com.pm.analytics;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class RuleEngine {

    static final Duration RATE_WINDOW = Duration.ofSeconds(60);
    static final Duration RATE_MIN_SPAN = Duration.ofSeconds(30);
    static final int CLEAR_AFTER_READINGS = 3;
    static final Duration OFFLINE_MINIMUM = Duration.ofSeconds(30);
    static final double OFFLINE_INTERVALS = 5;

    List<AlertEvent> onReading(Reading reading, SensorConfig config, SensorState state, Instant now) {
        List<AlertEvent> events = new ArrayList<>();
        state.plantId = reading.plantId();
        state.lastValue = reading.value();
        state.lastSeen = now;
        recordPoint(state, reading);

        if (state.active.remove(Rule.SENSOR_OFFLINE) != null) {
            events.add(event(
                    config,
                    reading.plantId(),
                    Rule.SENSOR_OFFLINE,
                    AlertEvent.RESOLVED,
                    AlertEvent.WARNING,
                    null,
                    null,
                    config.name() + " is reporting again",
                    reading.ts()));
        }

        String name = config.name();
        String unit = config.unit();

        if (config.max() != null) {
            double limit = config.max();
            update(
                    events,
                    state,
                    config,
                    reading,
                    Rule.MAX_EXCEEDED,
                    reading.value() > limit,
                    AlertEvent.CRITICAL,
                    reading.value(),
                    limit,
                    name + " is " + Text.number(reading.value()) + " " + unit + ", above its maximum of "
                            + Text.number(limit) + " " + unit,
                    name + " is back within its maximum of " + Text.number(limit) + " " + unit);
        }

        if (config.min() != null) {
            double limit = config.min();
            update(
                    events,
                    state,
                    config,
                    reading,
                    Rule.MIN_EXCEEDED,
                    reading.value() < limit,
                    AlertEvent.CRITICAL,
                    reading.value(),
                    limit,
                    name + " is " + Text.number(reading.value()) + " " + unit + ", below its minimum of "
                            + Text.number(limit) + " " + unit,
                    name + " is back above its minimum of " + Text.number(limit) + " " + unit);
        }

        if (config.rateOfChangePerMinute() != null) {
            double limit = config.rateOfChangePerMinute();
            Double rate = ratePerMinute(state, reading);
            if (rate != null) {
                update(
                        events,
                        state,
                        config,
                        reading,
                        Rule.RATE_OF_CHANGE,
                        Math.abs(rate) > limit,
                        AlertEvent.WARNING,
                        rate,
                        limit,
                        name + " is changing by " + Text.signed(rate) + " " + unit
                                + " per minute, faster than its limit of " + Text.number(limit) + " " + unit
                                + " per minute",
                        name + " is changing within its limit of " + Text.number(limit) + " " + unit
                                + " per minute again");
            }
        }

        return events;
    }

    List<AlertEvent> checkOffline(SensorConfig config, SensorState state, Instant now) {
        if (state.lastSeen == null || state.active.containsKey(Rule.SENSOR_OFFLINE)) {
            return List.of();
        }
        Duration silent = Duration.between(state.lastSeen, now);
        if (silent.compareTo(offlineThreshold(config)) <= 0) {
            return List.of();
        }
        state.active.put(Rule.SENSOR_OFFLINE, new SensorState.ActiveCondition(AlertEvent.WARNING));
        return List.of(event(
                config,
                state.plantId,
                Rule.SENSOR_OFFLINE,
                AlertEvent.OPEN,
                AlertEvent.WARNING,
                null,
                null,
                config.name() + " has not reported for " + silent.toSeconds() + " seconds",
                now));
    }

    static Duration offlineThreshold(SensorConfig config) {
        long expectedSeconds = Math.round(OFFLINE_INTERVALS / config.samplingHz());
        return expectedSeconds < OFFLINE_MINIMUM.toSeconds() ? OFFLINE_MINIMUM : Duration.ofSeconds(expectedSeconds);
    }

    private void update(
            List<AlertEvent> events,
            SensorState state,
            SensorConfig config,
            Reading reading,
            Rule rule,
            boolean violated,
            String severity,
            double value,
            double limit,
            String openMessage,
            String resolvedMessage) {
        SensorState.ActiveCondition active = state.active.get(rule);
        if (violated) {
            if (active == null) {
                state.active.put(rule, new SensorState.ActiveCondition(severity));
                events.add(event(
                        config,
                        reading.plantId(),
                        rule,
                        AlertEvent.OPEN,
                        severity,
                        value,
                        limit,
                        openMessage,
                        reading.ts()));
            } else {
                active.clearStreak = 0;
            }
        } else if (active != null) {
            active.clearStreak++;
            if (active.clearStreak >= CLEAR_AFTER_READINGS) {
                state.active.remove(rule);
                events.add(event(
                        config,
                        reading.plantId(),
                        rule,
                        AlertEvent.RESOLVED,
                        active.severity,
                        value,
                        limit,
                        resolvedMessage,
                        reading.ts()));
            }
        }
    }

    private static void recordPoint(SensorState state, Reading reading) {
        state.window.addLast(new SensorState.Point(reading.ts(), reading.value()));
        Instant keepFrom = reading.ts().minus(RATE_WINDOW.multipliedBy(2));
        while (!state.window.isEmpty() && state.window.peekFirst().ts().isBefore(keepFrom)) {
            state.window.pollFirst();
        }
    }

    private static Double ratePerMinute(SensorState state, Reading reading) {
        Instant earliest = reading.ts().minus(RATE_WINDOW);
        SensorState.Point reference = null;
        for (SensorState.Point point : state.window) {
            if (!point.ts().isBefore(earliest) && point.ts().isBefore(reading.ts())) {
                reference = point;
                break;
            }
        }
        if (reference == null) {
            return null;
        }
        Duration span = Duration.between(reference.ts(), reading.ts());
        if (span.compareTo(RATE_MIN_SPAN) < 0) {
            return null;
        }
        return (reading.value() - reference.value()) / (span.toMillis() / 60_000.0);
    }

    private static AlertEvent event(
            SensorConfig config,
            String plantId,
            Rule rule,
            String state,
            String severity,
            Double value,
            Double limit,
            String message,
            Instant ts) {
        return new AlertEvent(
                1,
                config.orgId(),
                plantId,
                config.machineId(),
                config.sensorId(),
                rule,
                state,
                severity,
                value,
                limit,
                message,
                ts.toString());
    }
}
