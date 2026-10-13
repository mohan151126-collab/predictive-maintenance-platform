package com.pm.analytics;

import static com.pm.analytics.Fixtures.MACHINE;
import static com.pm.analytics.Fixtures.OTHER_SENSOR;
import static com.pm.analytics.Fixtures.SENSOR;
import static com.pm.analytics.Fixtures.T0;
import static com.pm.analytics.Fixtures.config;
import static com.pm.analytics.Fixtures.reading;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MonitorTest {

    private static final class MutableClock extends Clock {
        private Instant now = T0;

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        void set(Instant instant) {
            now = instant;
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final class RecordingSink implements Monitor.EventSink {
        final List<AlertEvent> alerts = new ArrayList<>();
        final List<HealthEvent> healths = new ArrayList<>();

        @Override
        public void alert(AlertEvent event) {
            Contracts.assertValid("alert.schema.json", event);
            alerts.add(event);
        }

        @Override
        public void health(HealthEvent event) {
            Contracts.assertValid("machine-health.schema.json", event);
            healths.add(event);
        }

        HealthEvent lastHealth() {
            return healths.get(healths.size() - 1);
        }
    }

    private final MutableClock clock = new MutableClock();
    private final RecordingSink sink = new RecordingSink();

    private Monitor monitorWith(SensorConfig... sensors) {
        Map<String, SensorConfig> bySensor = new java.util.HashMap<>();
        for (SensorConfig sensor : sensors) {
            bySensor.put(sensor.sensorId(), sensor);
        }
        SensorConfigs configs = new SensorConfigs() {
            @Override
            public Optional<SensorConfig> find(String sensorId) {
                return Optional.ofNullable(bySensor.get(sensorId));
            }

            @Override
            public List<SensorConfig> forMachine(String machineId) {
                return List.copyOf(bySensor.values());
            }
        };
        return new Monitor(configs, sink, clock);
    }

    private void feed(Monitor monitor, double value, long seconds) {
        clock.set(T0.plusSeconds(seconds));
        monitor.onReading(reading(value, seconds));
    }

    @Test
    void tellsTheWholeStoryOfAMachineThatOverheatsAndRecovers() {
        Monitor monitor = monitorWith(config(null, 9.0, null));

        feed(monitor, 5.0, 0);
        monitor.tick();
        assertThat(sink.alerts).isEmpty();
        assertThat(sink.healths).hasSize(1);
        assertThat(sink.lastHealth().status()).isEqualTo("healthy");
        assertThat(sink.lastHealth().healthScore()).isEqualTo(100);

        clock.advance(Duration.ofSeconds(5));
        monitor.tick();
        assertThat(sink.healths).as("unchanged health is not repeated").hasSize(1);

        feed(monitor, 9.5, 10);
        assertThat(sink.alerts).hasSize(1);
        assertThat(sink.alerts.get(0).state()).isEqualTo(AlertEvent.OPEN);
        monitor.tick();
        assertThat(sink.lastHealth().status()).isEqualTo("critical");
        assertThat(sink.lastHealth().healthScore()).isZero();
        assertThat(sink.lastHealth().worstSensorId()).isEqualTo(SENSOR);

        feed(monitor, 5.0, 11);
        feed(monitor, 5.0, 12);
        feed(monitor, 5.0, 13);
        assertThat(sink.alerts).hasSize(2);
        assertThat(sink.alerts.get(1).state()).isEqualTo(AlertEvent.RESOLVED);
        monitor.tick();
        assertThat(sink.lastHealth().status()).isEqualTo("healthy");
    }

    @Test
    void repeatsTheCurrentHealthEveryMinuteAsAHeartbeat() {
        Monitor monitor = monitorWith(config(null, 9.0, null));
        feed(monitor, 5.0, 0);
        monitor.tick();

        clock.set(T0.plusSeconds(59));
        feed(monitor, 5.0, 59);
        monitor.tick();
        assertThat(sink.healths).hasSize(1);

        clock.set(T0.plusSeconds(61));
        feed(monitor, 5.0, 61);
        monitor.tick();
        assertThat(sink.healths).hasSize(2);
    }

    @Test
    void raisesAnOfflineAlertWhenReadingsStopAndLowersTheScore() {
        Monitor monitor = monitorWith(config(null, 100.0, null));
        feed(monitor, 5.0, 0);
        monitor.tick();

        clock.set(T0.plusSeconds(40));
        monitor.tick();

        assertThat(sink.alerts).hasSize(1);
        assertThat(sink.alerts.get(0).rule()).isEqualTo(Rule.SENSOR_OFFLINE);
        assertThat(sink.lastHealth().healthScore()).isEqualTo(50);
        assertThat(sink.lastHealth().reasons()).containsExactly("Spindle vibration has stopped reporting");

        clock.set(T0.plusSeconds(45));
        monitor.tick();
        assertThat(sink.alerts).as("only one offline alert").hasSize(1);
    }

    @Test
    void reportsUnknownHealthForAMachineWithoutAnyLimits() {
        Monitor monitor = monitorWith(config(null, null, null));

        feed(monitor, 5.0, 0);
        monitor.tick();

        assertThat(sink.healths).hasSize(1);
        assertThat(sink.lastHealth().status()).isEqualTo("unknown");
        assertThat(sink.lastHealth().healthScore()).isNull();
        assertThat(sink.alerts).isEmpty();
    }

    @Test
    void ignoresReadingsFromSensorsItDoesNotKnow() {
        Monitor monitor = monitorWith(config(null, 9.0, null));

        monitor.onReading(reading(OTHER_SENSOR, 99.0, 0));
        monitor.tick();

        assertThat(sink.alerts).isEmpty();
        assertThat(sink.healths).isEmpty();
    }

    @Test
    void combinesSeveralSensorsOfOneMachine() {
        Monitor monitor = monitorWith(
                config(SENSOR, "Spindle vibration", null, 9.0, null),
                config(OTHER_SENSOR, "Motor temperature", 10.0, 90.0, null));

        clock.set(T0);
        monitor.onReading(reading(SENSOR, 5.0, 0));
        monitor.onReading(reading(OTHER_SENSOR, 50.0, 0));
        monitor.tick();
        assertThat(sink.lastHealth().healthScore()).isEqualTo(100);

        clock.set(T0.plusSeconds(1));
        monitor.onReading(reading(OTHER_SENSOR, 95.0, 1));
        monitor.tick();

        assertThat(sink.alerts).hasSize(1);
        assertThat(sink.alerts.get(0).machineId()).isEqualTo(MACHINE);
        assertThat(sink.lastHealth().healthScore()).isZero();
        assertThat(sink.lastHealth().worstSensorId()).isEqualTo(OTHER_SENSOR);
    }
}
