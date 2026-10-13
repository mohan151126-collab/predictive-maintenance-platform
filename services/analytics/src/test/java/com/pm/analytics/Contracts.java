package com.pm.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import tools.jackson.databind.json.JsonMapper;

final class Contracts {

    static final JsonMapper MAPPER = JsonMapper.builder().build();

    private Contracts() {}

    static void assertValid(String schemaFile, Object event) {
        String json = MAPPER.writeValueAsString(event);
        SchemaRegistry registry = SchemaRegistry.withDefaultDialect(
                SpecificationVersion.DRAFT_2020_12,
                builder -> builder.schemaRegistryConfig(
                        SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build()));
        try (InputStream in = Contracts.class.getResourceAsStream("/" + schemaFile)) {
            Schema schema = registry.getSchema(in, InputFormat.JSON);
            assertThat(schema.validate(json, InputFormat.JSON))
                    .as("%s against %s", json, schemaFile)
                    .isEmpty();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
