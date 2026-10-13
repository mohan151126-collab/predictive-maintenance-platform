package com.pm.analytics;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AlertEvent(
        int schemaVersion,
        String orgId,
        String plantId,
        String machineId,
        String sensorId,
        Rule rule,
        String state,
        String severity,
        Double value,
        Double limit,
        String message,
        String ts) {

    public static final String OPEN = "OPEN";
    public static final String RESOLVED = "RESOLVED";
    public static final String WARNING = "warning";
    public static final String CRITICAL = "critical";
}
