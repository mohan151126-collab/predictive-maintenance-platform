package com.pm.analytics;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "analytics")
public record AnalyticsProperties(@DefaultValue Topics topics) {

    public record Topics(
            @DefaultValue("telemetry.raw") String raw,
            @DefaultValue("alerts") String alerts,
            @DefaultValue("machine.health") String health) {}
}
