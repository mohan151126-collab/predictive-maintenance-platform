package com.pm.analytics;

public record SensorConfig(
        String sensorId,
        String orgId,
        String machineId,
        String name,
        String unit,
        double samplingHz,
        Double min,
        Double max,
        Double rateOfChangePerMinute) {

    public boolean hasRules() {
        return min != null || max != null || rateOfChangePerMinute != null;
    }
}
