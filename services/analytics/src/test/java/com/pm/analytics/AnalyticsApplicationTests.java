package com.pm.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {"analytics.enabled=false", "spring.mongodb.uri=mongodb://localhost/test"})
class AnalyticsApplicationTests {

    @Test
    void contextLoads() {}
}
