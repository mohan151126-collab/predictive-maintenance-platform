package com.pm.ingestion;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "ingestion.mqtt.enabled=false")
class IngestionApplicationTests {

    @Test
    void contextLoads() {}
}
