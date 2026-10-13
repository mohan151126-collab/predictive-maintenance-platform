package com.pm.analytics;

import java.util.List;
import java.util.Optional;

public interface SensorConfigs {

    Optional<SensorConfig> find(String sensorId);

    List<SensorConfig> forMachine(String machineId);
}
