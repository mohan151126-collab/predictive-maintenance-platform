package com.pm.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

class ReadingParserTest {

    private final ReadingParser parser = new ReadingParser(Contracts.MAPPER);

    private static ObjectNode example() throws IOException {
        try (InputStream in = ReadingParserTest.class.getResourceAsStream("/telemetry.example.json")) {
            return (ObjectNode) Contracts.MAPPER.readTree(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    @Test
    void parsesTheContractExample() throws IOException {
        Reading reading = parser.parse(example().toString()).orElseThrow();

        assertThat(reading.orgId()).isEqualTo("6acb97418f15672ff985c5ef");
        assertThat(reading.plantId()).isEqualTo("6acba134ed0ec5f5a756b95d");
        assertThat(reading.machineId()).isEqualTo("6acba4c1b8f3bc79fe53fcb9");
        assertThat(reading.sensorId()).isEqualTo("6acbb105eed04b44409d2547");
        assertThat(reading.type()).isEqualTo("vibration_rms");
        assertThat(reading.unit()).isEqualTo("mm/s");
        assertThat(reading.value()).isEqualTo(4.31);
        assertThat(reading.ts()).isEqualTo(Instant.parse("2026-10-13T09:15:02.120Z"));
    }

    @Test
    void rejectsBrokenJson() {
        assertThat(parser.parse("{not json")).isEmpty();
    }

    @Test
    void rejectsAMissingValue() throws IOException {
        ObjectNode message = example();
        message.remove("value");
        assertThat(parser.parse(message.toString())).isEmpty();
    }

    @Test
    void rejectsAValueSentAsText() throws IOException {
        ObjectNode message = example();
        message.put("value", "4.31");
        assertThat(parser.parse(message.toString())).isEmpty();
    }

    @Test
    void rejectsAMissingId() throws IOException {
        ObjectNode message = example();
        message.remove("sensorId");
        assertThat(parser.parse(message.toString())).isEmpty();
    }

    @Test
    void rejectsABadTimestamp() throws IOException {
        ObjectNode message = example();
        message.put("ts", "yesterday");
        assertThat(parser.parse(message.toString())).isEmpty();
    }

    @Test
    void rejectsJsonThatIsNotAnObject() {
        assertThat(parser.parse("[1,2,3]")).isEmpty();
        assertThat(parser.parse("42")).isEmpty();
    }
}
