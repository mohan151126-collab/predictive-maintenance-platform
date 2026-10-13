package com.pm.analytics;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record HealthEvent(
        int schemaVersion,
        String orgId,
        String plantId,
        String machineId,
        String status,
        Integer healthScore,
        String worstSensorId,
        List<String> reasons,
        String ts) {}
