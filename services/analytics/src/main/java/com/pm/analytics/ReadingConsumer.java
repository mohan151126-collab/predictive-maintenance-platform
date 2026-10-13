package com.pm.analytics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
class ReadingConsumer {

    private final ReadingParser parser;
    private final Monitor monitor;
    private final TelemetryStore store;
    private final Counter processed;
    private final Counter skipped;

    ReadingConsumer(ReadingParser parser, Monitor monitor, TelemetryStore store, MeterRegistry meters) {
        this.parser = parser;
        this.monitor = monitor;
        this.store = store;
        this.processed = Counter.builder("analytics.readings").tag("outcome", "processed").register(meters);
        this.skipped = Counter.builder("analytics.readings").tag("outcome", "skipped").register(meters);
    }

    @KafkaListener(topics = "${analytics.topics.raw:telemetry.raw}", batch = "true")
    void onMessages(List<String> payloads) {
        List<Reading> readings = new ArrayList<>(payloads.size());
        for (String payload : payloads) {
            parser.parse(payload).ifPresentOrElse(readings::add, skipped::increment);
        }

        readings.forEach(monitor::onReading);
        store.saveAll(readings);
        processed.increment(readings.size());
    }
}
