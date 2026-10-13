package com.pm.analytics;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

final class HealthCalculator {

    static final String UNKNOWN = "unknown";
    static final String HEALTHY = "healthy";
    static final String WATCH = "watch";
    static final String WARNING = "warning";
    static final String CRITICAL = "critical";

    private static final double SAFE_FRACTION = 0.7;
    private static final double AT_LIMIT_STRESS = 0.6;
    private static final double ATTENTION_STRESS = 0.5;
    private static final double REASON_MIN_STRESS = 0.2;
    private static final int MAX_REASONS = 3;

    record SensorView(SensorConfig config, SensorState state) {}

    private record Assessment(SensorView view, double stress, String reason) {}

    HealthEvent compute(
            String orgId, String plantId, String machineId, List<SensorView> sensors, Instant now) {
        List<SensorView> reported =
                sensors.stream().filter(view -> view.state().lastValue != null).toList();

        if (reported.stream().noneMatch(view -> view.config().hasRules())) {
            return event(orgId, plantId, machineId, UNKNOWN, null, null, List.of(), now);
        }

        List<Assessment> assessments = reported.stream()
                .map(HealthCalculator::assess)
                .sorted(Comparator.comparingDouble(Assessment::stress).reversed())
                .toList();

        Assessment worst = assessments.get(0);
        int score = (int) Math.round(100 * (1 - worst.stress()));
        List<String> reasons = assessments.stream()
                .filter(a -> a.stress() >= REASON_MIN_STRESS && a.reason() != null)
                .limit(MAX_REASONS)
                .map(Assessment::reason)
                .toList();

        return event(
                orgId,
                plantId,
                machineId,
                statusFor(score),
                score,
                worst.stress() > 0 ? worst.view().config().sensorId() : null,
                reasons,
                now);
    }

    static String statusFor(int score) {
        if (score >= 80) return HEALTHY;
        if (score >= 50) return WATCH;
        if (score >= 20) return WARNING;
        return CRITICAL;
    }

    static double utilisation(SensorConfig config, double value) {
        Double min = config.min();
        Double max = config.max();
        if (min != null && max != null) {
            double half = (max - min) / 2;
            return half <= 0 ? 0 : Math.abs(value - (max + min) / 2) / half;
        }
        if (max != null) {
            return max > 0 ? value / max : 0;
        }
        if (min != null) {
            return min > 0 && value > 0 ? min / value : 0;
        }
        return 0;
    }

    private static Assessment assess(SensorView view) {
        SensorConfig config = view.config();
        SensorState state = view.state();
        double value = state.lastValue;
        String name = config.name();
        String unit = config.unit();

        double stress = 0;
        String reason = null;

        boolean overMax = config.max() != null
                && (state.active.containsKey(Rule.MAX_EXCEEDED) || value > config.max());
        boolean underMin = config.min() != null
                && (state.active.containsKey(Rule.MIN_EXCEEDED) || value < config.min());

        if (overMax) {
            stress = 1;
            reason = name + " is above its maximum of " + Text.number(config.max()) + " " + unit;
        } else if (underMin) {
            stress = 1;
            reason = name + " is below its minimum of " + Text.number(config.min()) + " " + unit;
        } else if (config.min() != null || config.max() != null) {
            double used = utilisation(config, value);
            double proximity = clamp((used - SAFE_FRACTION) / (1 - SAFE_FRACTION)) * AT_LIMIT_STRESS;
            if (proximity > 0) {
                stress = proximity;
                reason = name + " is at " + Math.round(used * 100) + "% of its limit";
            }
        }

        if (state.active.containsKey(Rule.RATE_OF_CHANGE) && ATTENTION_STRESS > stress) {
            stress = ATTENTION_STRESS;
            reason = name + " is changing faster than its limit";
        }
        if (state.active.containsKey(Rule.SENSOR_OFFLINE) && ATTENTION_STRESS > stress) {
            stress = ATTENTION_STRESS;
            reason = name + " has stopped reporting";
        }

        return new Assessment(view, stress, reason);
    }

    private static double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }

    private static HealthEvent event(
            String orgId,
            String plantId,
            String machineId,
            String status,
            Integer score,
            String worstSensorId,
            List<String> reasons,
            Instant now) {
        return new HealthEvent(
                1,
                orgId,
                plantId,
                machineId,
                status,
                score,
                worstSensorId,
                reasons.isEmpty() ? null : reasons,
                now.toString());
    }
}
