package com.pm.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

class TelemetryValidatorTest {

    private final TelemetryValidator validator;

    TelemetryValidatorTest() throws IOException {
        this.validator = new TelemetryValidator();
    }

    private void assertRejected(Consumer<ObjectNode> breakIt) {
        ObjectNode message = TestData.example();
        breakIt.accept(message);
        assertThat(validator.validate(message.toString())).isNotEmpty();
    }

    @Test
    void acceptsTheContractExample() {
        assertThat(validator.validate(TestData.example().toString())).isEmpty();
    }

    @Test
    void rejectsAMissingValue() {
        assertRejected(m -> m.remove("value"));
    }

    @Test
    void rejectsAValueSentAsText() {
        assertRejected(m -> m.put("value", "4.3"));
    }

    @Test
    void rejectsAnUnknownSensorType() {
        assertRejected(m -> m.put("type", "banana"));
    }

    @Test
    void rejectsAMalformedId() {
        assertRejected(m -> m.put("sensorId", "abc"));
    }

    @Test
    void rejectsABadTimestamp() {
        assertRejected(m -> m.put("ts", "yesterday"));
    }

    @Test
    void rejectsAnExtraField() {
        assertRejected(m -> m.put("extra", 1));
    }

    @Test
    void rejectsAnotherSchemaVersion() {
        assertRejected(m -> m.put("schemaVersion", 2));
    }
}
