package com.pm.ingestion;

import com.hivemq.client.mqtt.datatypes.MqttQos;
import com.hivemq.client.mqtt.mqtt3.Mqtt3AsyncClient;
import com.hivemq.client.mqtt.mqtt3.Mqtt3Client;
import com.hivemq.client.mqtt.mqtt3.message.publish.Mqtt3Publish;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "ingestion.mqtt.enabled", havingValue = "true", matchIfMissing = true)
public class MqttSubscriber implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(MqttSubscriber.class);
    private static final long RETRY_SECONDS = 5;

    private final IngestionProperties properties;
    private final TelemetryProcessor processor;
    private final ScheduledExecutorService retryExecutor = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("mqtt-connect-retry").factory());

    private volatile Mqtt3AsyncClient client;
    private volatile boolean running;

    public MqttSubscriber(IngestionProperties properties, TelemetryProcessor processor) {
        this.properties = properties;
        this.processor = processor;
    }

    @Override
    public void start() {
        IngestionProperties.Mqtt mqtt = properties.mqtt();
        client = Mqtt3Client.builder()
                .identifier(mqtt.clientId())
                .serverHost(mqtt.host())
                .serverPort(mqtt.port())
                .automaticReconnectWithDefaultConfig()
                .addConnectedListener(context -> subscribe())
                .buildAsync();
        running = true;
        connect();
    }

    private void connect() {
        if (!running) {
            return;
        }
        IngestionProperties.Mqtt mqtt = properties.mqtt();
        client.connectWith().keepAlive(30).send().whenComplete((ack, error) -> {
            if (error != null) {
                log.warn(
                        "Could not connect to MQTT broker at {}:{}, retrying in {}s: {}",
                        mqtt.host(),
                        mqtt.port(),
                        RETRY_SECONDS,
                        error.getMessage());
                retryExecutor.schedule(this::connect, RETRY_SECONDS, TimeUnit.SECONDS);
            }
        });
    }

    private void subscribe() {
        String filter = properties.mqtt().topicFilter();
        client.subscribeWith()
                .topicFilter(filter)
                .qos(MqttQos.AT_LEAST_ONCE)
                .callback(this::onMessage)
                .send()
                .whenComplete((ack, error) -> {
                    if (error != null) {
                        log.error("Could not subscribe to {}", filter, error);
                    } else {
                        log.info("Subscribed to MQTT topic filter {}", filter);
                    }
                });
    }

    private void onMessage(Mqtt3Publish publish) {
        try {
            processor.process(publish.getTopic().toString(), publish.getPayloadAsBytes());
        } catch (RuntimeException e) {
            log.error("Failed to process message on {}", publish.getTopic(), e);
        }
    }

    @Override
    public void stop() {
        running = false;
        retryExecutor.shutdownNow();
        Mqtt3AsyncClient current = client;
        if (current != null) {
            current.disconnect();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }
}
