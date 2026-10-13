package com.pm.ingestion;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "ingestion")
public record IngestionProperties(@DefaultValue Mqtt mqtt, @DefaultValue Topics topics) {

    public record Mqtt(
            @DefaultValue("localhost") String host,
            @DefaultValue("1883") int port,
            @DefaultValue("ingestion-1") String clientId,
            @DefaultValue("plant/#") String topicFilter) {}

    public record Topics(
            @DefaultValue("telemetry.raw") String raw,
            @DefaultValue("telemetry.deadletter") String deadLetter) {}
}
