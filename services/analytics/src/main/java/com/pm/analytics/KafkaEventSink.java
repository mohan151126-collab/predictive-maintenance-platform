package com.pm.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
class KafkaEventSink implements Monitor.EventSink {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventSink.class);

    private final KafkaTemplate<String, String> kafka;
    private final JsonMapper mapper;
    private final AnalyticsProperties properties;

    KafkaEventSink(KafkaTemplate<String, String> kafka, JsonMapper mapper, AnalyticsProperties properties) {
        this.kafka = kafka;
        this.mapper = mapper;
        this.properties = properties;
    }

    @Override
    public void alert(AlertEvent event) {
        log.info("Alert {} {} on sensor {}: {}", event.state(), event.rule().wireName(), event.sensorId(), event.message());
        send(properties.topics().alerts(), event.machineId(), event);
    }

    @Override
    public void health(HealthEvent event) {
        log.info("Health of machine {}: {} ({})", event.machineId(), event.status(), event.healthScore());
        send(properties.topics().health(), event.machineId(), event);
    }

    private void send(String topic, String key, Object event) {
        kafka.send(topic, key, mapper.writeValueAsString(event)).whenComplete((result, error) -> {
            if (error != null) {
                log.error("Failed to send event to Kafka topic {}", topic, error);
            }
        });
    }
}
