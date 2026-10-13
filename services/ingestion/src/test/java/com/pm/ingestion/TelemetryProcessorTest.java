package com.pm.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

class TelemetryProcessorTest {

    private record Sent(String topic, String key, String value) {}

    private static final String RAW = "telemetry.raw";
    private static final String DEAD = "telemetry.deadletter";

    private final List<Sent> sent = new ArrayList<>();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private TelemetryProcessor processor;

    @BeforeEach
    void setUp() throws IOException {
        IngestionProperties properties = new IngestionProperties(
                new IngestionProperties.Mqtt("localhost", 1883, "test", "plant/#"),
                new IngestionProperties.Topics(RAW, DEAD));
        processor = new TelemetryProcessor(
                new TelemetryValidator(),
                TestData.MAPPER,
                (topic, key, value) -> sent.add(new Sent(topic, key, value)),
                properties,
                meters);
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private double count(String outcome) {
        return meters.get("ingestion.messages").tag("outcome", outcome).counter().count();
    }

    private JsonNode onlyDeadLetter() {
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).topic()).isEqualTo(DEAD);
        return TestData.MAPPER.readTree(sent.get(0).value());
    }

    @Test
    void forwardsAValidMessageToTheRawTopicKeyedByMachine() {
        ObjectNode message = TestData.example();

        processor.process(TestData.topicFor(message), bytes(message.toString()));

        assertThat(sent).containsExactly(new Sent(RAW, message.get("machineId").asString(), message.toString()));
        assertThat(count("accepted")).isEqualTo(1);
        assertThat(count("rejected")).isZero();
    }

    @Test
    void sendsMalformedJsonToTheDeadLetterTopic() {
        processor.process("plant/x", bytes("{not json"));

        JsonNode dead = onlyDeadLetter();
        assertThat(dead.get("reason").asString()).isEqualTo("not valid JSON");
        assertThat(dead.get("payload").asString()).isEqualTo("{not json");
        assertThat(dead.get("topic").asString()).isEqualTo("plant/x");
        assertThat(count("rejected")).isEqualTo(1);
        assertThat(count("accepted")).isZero();
    }

    @Test
    void sendsContractViolationsToTheDeadLetterTopic() {
        ObjectNode message = TestData.example();
        message.put("value", "4.3");

        processor.process(TestData.topicFor(message), bytes(message.toString()));

        assertThat(onlyDeadLetter().get("reason").asString()).startsWith("contract violation");
    }

    @Test
    void rejectsATopicThatDisagreesWithThePayload() {
        ObjectNode message = TestData.example();
        String otherMachine = "plant/%s/machine/%s/sensor/%s"
                .formatted(
                        message.get("plantId").asString(),
                        "aaaaaaaaaaaaaaaaaaaaaaaa",
                        message.get("sensorId").asString());

        processor.process(otherMachine, bytes(message.toString()));

        assertThat(onlyDeadLetter().get("reason").asString()).isEqualTo("topic does not match payload ids");
    }

    @Test
    void rejectsATopicWithTheWrongShape() {
        ObjectNode message = TestData.example();

        processor.process("some/other/topic", bytes(message.toString()));

        assertThat(onlyDeadLetter().get("reason").asString()).isEqualTo("topic does not match payload ids");
    }

    @Test
    void rejectsAnOversizedPayloadAndTruncatesItInTheDeadLetter() {
        String huge = "x".repeat(TelemetryProcessor.MAX_PAYLOAD_BYTES + 1);

        processor.process("plant/x", bytes(huge));

        JsonNode dead = onlyDeadLetter();
        assertThat(dead.get("reason").asString()).startsWith("payload larger than");
        assertThat(dead.get("payload").asString()).hasSize(2000);
    }

    @Test
    void doesNotSendAnythingToTheRawTopicForRejectedMessages() {
        processor.process("plant/x", bytes("[]"));

        assertThat(sent).noneMatch(s -> s.topic().equals(RAW));
    }
}
