package com.pm.ingestion;

import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class TelemetryValidator {

    private static final String SCHEMA_RESOURCE = "telemetry.schema.json";

    private final Schema schema;

    public TelemetryValidator() throws IOException {
        SchemaRegistry registry = SchemaRegistry.withDefaultDialect(
                SpecificationVersion.DRAFT_2020_12,
                builder -> builder.schemaRegistryConfig(
                        SchemaRegistryConfig.builder().formatAssertionsEnabled(true).build()));
        try (InputStream in = new ClassPathResource(SCHEMA_RESOURCE).getInputStream()) {
            this.schema = registry.getSchema(in, InputFormat.JSON);
        }
    }

    /** Returns the violations of the telemetry contract; empty when the message is valid. */
    public List<String> validate(String json) {
        return schema.validate(json, InputFormat.JSON).stream().map(Error::getMessage).toList();
    }
}
