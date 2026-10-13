package com.pm.analytics;

import java.time.Instant;

public record Reading(
        String orgId,
        String plantId,
        String machineId,
        String sensorId,
        String type,
        String unit,
        double value,
        Instant ts) {}
