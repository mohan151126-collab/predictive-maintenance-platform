package com.pm.analytics;

import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
class MonitorConfiguration {

    @Bean
    Monitor monitor(SensorConfigs configs, Monitor.EventSink sink) {
        return new Monitor(configs, sink, Clock.systemUTC());
    }

    @Bean
    MonitorTicker monitorTicker(Monitor monitor) {
        return new MonitorTicker(monitor);
    }

    static final class MonitorTicker {

        private final Monitor monitor;

        MonitorTicker(Monitor monitor) {
            this.monitor = monitor;
        }

        @Scheduled(fixedDelay = 5_000, initialDelay = 5_000)
        void tick() {
            monitor.tick();
        }
    }
}
