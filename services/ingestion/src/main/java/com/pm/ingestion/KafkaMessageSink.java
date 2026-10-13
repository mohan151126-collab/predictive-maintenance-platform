package com.pm.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
class KafkaMessageSink implements MessageSink {

    private static final Logger log = LoggerFactory.getLogger(KafkaMessageSink.class);

    private final KafkaTemplate<String, String> kafka;

    KafkaMessageSink(KafkaTemplate<String, String> kafka) {
        this.kafka = kafka;
    }

    @Override
    public void send(String topic, String key, String value) {
        kafka.send(topic, key, value).whenComplete((result, error) -> {
            if (error != null) {
                log.error("Failed to send message to Kafka topic {}", topic, error);
            }
        });
    }
}
