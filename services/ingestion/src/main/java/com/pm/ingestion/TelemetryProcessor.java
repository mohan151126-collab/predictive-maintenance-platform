package com.pm.ingestion;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
public class TelemetryProcessor {

    static final int MAX_PAYLOAD_BYTES = 4096;
    private static final int MAX_DEAD_LETTER_PAYLOAD_CHARS = 2000;
    private static final Logger log = LoggerFactory.getLogger(TelemetryProcessor.class);
    private static final Pattern TOPIC =
            Pattern.compile("^plant/([a-f0-9]{24})/machine/([a-f0-9]{24})/sensor/([a-f0-9]{24})$");

    private final TelemetryValidator validator;
    private final JsonMapper mapper;
    private final MessageSink sink;
    private final IngestionProperties properties;
    private final Counter accepted;
    private final Counter rejected;

    public TelemetryProcessor(
            TelemetryValidator validator,
            JsonMapper mapper,
            MessageSink sink,
            IngestionProperties properties,
            MeterRegistry meters) {
        this.validator = validator;
        this.mapper = mapper;
        this.sink = sink;
        this.properties = properties;
        this.accepted = Counter.builder("ingestion.messages").tag("outcome", "accepted").register(meters);
        this.rejected = Counter.builder("ingestion.messages").tag("outcome", "rejected").register(meters);
    }

    public void process(String topic, byte[] payload) {
        String text = new String(payload, StandardCharsets.UTF_8);

        if (payload.length > MAX_PAYLOAD_BYTES) {
            deadLetter(topic, text, "payload larger than " + MAX_PAYLOAD_BYTES + " bytes");
            return;
        }

        JsonNode message;
        try {
            message = mapper.readTree(text);
        } catch (JacksonException e) {
            deadLetter(topic, text, "not valid JSON");
            return;
        }

        List<String> violations = validator.validate(text);
        if (!violations.isEmpty()) {
            deadLetter(topic, text, "contract violation: " + String.join("; ", violations));
            return;
        }

        Matcher matcher = TOPIC.matcher(topic);
        if (!matcher.matches()
                || !matcher.group(1).equals(message.get("plantId").asString())
                || !matcher.group(2).equals(message.get("machineId").asString())
                || !matcher.group(3).equals(message.get("sensorId").asString())) {
            deadLetter(topic, text, "topic does not match payload ids");
            return;
        }

        sink.send(properties.topics().raw(), message.get("machineId").asString(), text);
        accepted.increment();
    }

    private void deadLetter(String topic, String payload, String reason) {
        log.warn("Rejected message on {}: {}", topic, reason);
        ObjectNode envelope = mapper.createObjectNode();
        envelope.put("reason", reason);
        envelope.put("topic", topic);
        envelope.put("receivedAt", Instant.now().toString());
        envelope.put(
                "payload",
                payload.length() > MAX_DEAD_LETTER_PAYLOAD_CHARS
                        ? payload.substring(0, MAX_DEAD_LETTER_PAYLOAD_CHARS)
                        : payload);
        sink.send(properties.topics().deadLetter(), null, mapper.writeValueAsString(envelope));
        rejected.increment();
    }
}
