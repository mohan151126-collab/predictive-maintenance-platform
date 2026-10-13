package com.pm.analytics;

import static com.pm.analytics.Fixtures.T0;
import static com.pm.analytics.Fixtures.config;
import static com.pm.analytics.Fixtures.reading;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class RuleEngineTest {

    private final RuleEngine engine = new RuleEngine();

    private List<AlertEvent> feed(SensorConfig config, SensorState state, double value, long seconds) {
        Reading reading = reading(value, seconds);
        return engine.onReading(reading, config, state, reading.ts());
    }

    @Test
    void opensExactlyOnceWhenTheMaximumIsExceeded() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = new SensorState();

        assertThat(feed(config, state, 8.0, 0)).isEmpty();

        List<AlertEvent> opened = feed(config, state, 9.4, 1);
        assertThat(opened).hasSize(1);
        AlertEvent alert = opened.get(0);
        assertThat(alert.rule()).isEqualTo(Rule.MAX_EXCEEDED);
        assertThat(alert.state()).isEqualTo(AlertEvent.OPEN);
        assertThat(alert.severity()).isEqualTo(AlertEvent.CRITICAL);
        assertThat(alert.value()).isEqualTo(9.4);
        assertThat(alert.limit()).isEqualTo(9.0);
        assertThat(alert.message()).isEqualTo("Spindle vibration is 9.4 mm/s, above its maximum of 9 mm/s");

        assertThat(feed(config, state, 9.8, 2)).isEmpty();
        assertThat(feed(config, state, 10.5, 3)).isEmpty();
    }

    @Test
    void readingExactlyAtTheLimitIsNotAViolation() {
        assertThat(feed(config(null, 9.0, null), new SensorState(), 9.0, 0)).isEmpty();
    }

    @Test
    void resolvesAfterThreeReadingsBackInsideTheLimit() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = new SensorState();
        feed(config, state, 9.5, 0);

        assertThat(feed(config, state, 8.0, 1)).isEmpty();
        assertThat(feed(config, state, 8.0, 2)).isEmpty();
        List<AlertEvent> resolved = feed(config, state, 8.0, 3);

        assertThat(resolved).hasSize(1);
        assertThat(resolved.get(0).state()).isEqualTo(AlertEvent.RESOLVED);
        assertThat(resolved.get(0).rule()).isEqualTo(Rule.MAX_EXCEEDED);
        assertThat(resolved.get(0).severity()).isEqualTo(AlertEvent.CRITICAL);
        assertThat(resolved.get(0).message()).isEqualTo("Spindle vibration is back within its maximum of 9 mm/s");
    }

    @Test
    void aNewViolationRestartsTheRecoveryCount() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = new SensorState();
        feed(config, state, 9.5, 0);
        feed(config, state, 8.0, 1);
        feed(config, state, 9.6, 2);

        assertThat(feed(config, state, 8.0, 3)).isEmpty();
        assertThat(feed(config, state, 8.0, 4)).isEmpty();
        assertThat(feed(config, state, 8.0, 5)).hasSize(1);
    }

    @Test
    void canOpenAgainAfterItWasResolved() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = new SensorState();
        feed(config, state, 9.5, 0);
        feed(config, state, 8.0, 1);
        feed(config, state, 8.0, 2);
        feed(config, state, 8.0, 3);

        List<AlertEvent> again = feed(config, state, 9.9, 4);

        assertThat(again).hasSize(1);
        assertThat(again.get(0).state()).isEqualTo(AlertEvent.OPEN);
    }

    @Test
    void opensWhenBelowTheMinimum() {
        SensorConfig config = config(10.0, null, null);
        SensorState state = new SensorState();

        assertThat(feed(config, state, 12.0, 0)).isEmpty();
        List<AlertEvent> opened = feed(config, state, 9.0, 1);

        assertThat(opened).hasSize(1);
        assertThat(opened.get(0).rule()).isEqualTo(Rule.MIN_EXCEEDED);
        assertThat(opened.get(0).message()).isEqualTo("Spindle vibration is 9 mm/s, below its minimum of 10 mm/s");
    }

    @Test
    void doesNothingWhenNoRulesAreConfigured() {
        SensorConfig config = config(null, null, null);
        SensorState state = new SensorState();

        assertThat(feed(config, state, 1000.0, 0)).isEmpty();
        assertThat(state.lastValue).isEqualTo(1000.0);
    }

    @Test
    void flagsAFastRiseOnceThereIsEnoughHistory() {
        SensorConfig config = config(null, null, 2.0);
        SensorState state = new SensorState();

        assertThat(feed(config, state, 50.0, 0)).isEmpty();
        assertThat(feed(config, state, 51.0, 10)).isEmpty();
        assertThat(feed(config, state, 52.0, 20)).isEmpty();

        List<AlertEvent> opened = feed(config, state, 53.0, 30);
        assertThat(opened).hasSize(1);
        AlertEvent alert = opened.get(0);
        assertThat(alert.rule()).isEqualTo(Rule.RATE_OF_CHANGE);
        assertThat(alert.severity()).isEqualTo(AlertEvent.WARNING);
        assertThat(alert.value()).isEqualTo(6.0);
        assertThat(alert.limit()).isEqualTo(2.0);
        assertThat(alert.message())
                .isEqualTo("Spindle vibration is changing by +6 mm/s per minute, faster than its limit of 2 mm/s per minute");
    }

    @Test
    void flagsAFastFallToo() {
        SensorConfig config = config(null, null, 2.0);
        SensorState state = new SensorState();
        feed(config, state, 60.0, 0);

        List<AlertEvent> opened = feed(config, state, 57.0, 30);

        assertThat(opened).hasSize(1);
        assertThat(opened.get(0).value()).isEqualTo(-6.0);
    }

    @Test
    void aSteadySignalNeverTriggersTheRateRule() {
        SensorConfig config = config(null, null, 2.0);
        SensorState state = new SensorState();

        for (long seconds = 0; seconds <= 180; seconds += 10) {
            assertThat(feed(config, state, 50.0, seconds)).isEmpty();
        }
    }

    @Test
    void resolvesTheRateRuleOnceTheSignalSettles() {
        SensorConfig config = config(null, null, 2.0);
        SensorState state = new SensorState();
        feed(config, state, 50.0, 0);
        feed(config, state, 53.0, 30);

        List<AlertEvent> all = new java.util.ArrayList<>();
        for (long seconds = 40; seconds <= 160; seconds += 10) {
            all.addAll(feed(config, state, 53.0, seconds));
        }

        assertThat(all).hasSize(1);
        assertThat(all.get(0).state()).isEqualTo(AlertEvent.RESOLVED);
        assertThat(all.get(0).rule()).isEqualTo(Rule.RATE_OF_CHANGE);
    }

    @Test
    void reportsASilentSensorOnceAndResolvesWhenItReturns() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = new SensorState();
        feed(config, state, 5.0, 0);

        assertThat(engine.checkOffline(config, state, T0.plusSeconds(20))).isEmpty();

        Instant silentUntil = T0.plusSeconds(31);
        List<AlertEvent> opened = engine.checkOffline(config, state, silentUntil);
        assertThat(opened).hasSize(1);
        assertThat(opened.get(0).rule()).isEqualTo(Rule.SENSOR_OFFLINE);
        assertThat(opened.get(0).state()).isEqualTo(AlertEvent.OPEN);
        assertThat(opened.get(0).value()).isNull();
        assertThat(opened.get(0).message()).isEqualTo("Spindle vibration has not reported for 31 seconds");
        assertThat(opened.get(0).ts()).isEqualTo(silentUntil.toString());

        assertThat(engine.checkOffline(config, state, T0.plusSeconds(90))).isEmpty();

        List<AlertEvent> back = feed(config, state, 5.0, 100);
        assertThat(back).hasSize(1);
        assertThat(back.get(0).rule()).isEqualTo(Rule.SENSOR_OFFLINE);
        assertThat(back.get(0).state()).isEqualTo(AlertEvent.RESOLVED);
        assertThat(back.get(0).message()).isEqualTo("Spindle vibration is reporting again");
    }

    @Test
    void slowSensorsGetALongerSilenceAllowance() {
        SensorConfig slow = new SensorConfig(
                Fixtures.SENSOR, Fixtures.ORG, Fixtures.MACHINE, "Slow", "C", 0.01, null, 90.0, null);
        SensorState state = new SensorState();
        engine.onReading(reading(5.0, 0), slow, state, T0);

        assertThat(engine.checkOffline(slow, state, T0.plusSeconds(400))).isEmpty();
        assertThat(engine.checkOffline(slow, state, T0.plusSeconds(501))).hasSize(1);
    }

    @Test
    void neverReportedSensorsAreNotOffline() {
        assertThat(engine.checkOffline(config(null, 9.0, null), new SensorState(), T0.plusSeconds(600))).isEmpty();
    }
}
