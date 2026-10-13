package com.pm.analytics;

import static com.pm.analytics.Fixtures.MACHINE;
import static com.pm.analytics.Fixtures.ORG;
import static com.pm.analytics.Fixtures.OTHER_SENSOR;
import static com.pm.analytics.Fixtures.PLANT;
import static com.pm.analytics.Fixtures.SENSOR;
import static com.pm.analytics.Fixtures.T0;
import static com.pm.analytics.Fixtures.config;
import static com.pm.analytics.Fixtures.stateWith;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class HealthCalculatorTest {

    private final HealthCalculator calculator = new HealthCalculator();

    private HealthEvent compute(HealthCalculator.SensorView... views) {
        return calculator.compute(ORG, PLANT, MACHINE, List.of(views), T0);
    }

    private static HealthCalculator.SensorView view(SensorConfig config, double value) {
        return new HealthCalculator.SensorView(config, stateWith(value));
    }

    @Test
    void isUnknownWhenNoSensorHasAnyRule() {
        HealthEvent event = compute(view(config(null, null, null), 5.0));

        assertThat(event.status()).isEqualTo("unknown");
        assertThat(event.healthScore()).isNull();
        assertThat(event.worstSensorId()).isNull();
        assertThat(event.reasons()).isNull();
    }

    @Test
    void isUnknownWhenNothingHasReportedYet() {
        HealthEvent event = compute(new HealthCalculator.SensorView(config(null, 9.0, null), new SensorState()));

        assertThat(event.status()).isEqualTo("unknown");
        assertThat(event.healthScore()).isNull();
    }

    @Test
    void isFullyHealthyWellInsideTheLimit() {
        HealthEvent event = compute(view(config(null, 9.0, null), 4.5));

        assertThat(event.healthScore()).isEqualTo(100);
        assertThat(event.status()).isEqualTo("healthy");
        assertThat(event.worstSensorId()).isNull();
        assertThat(event.reasons()).isNull();
    }

    @Test
    void startsLosingScoreAbove70PercentOfTheLimit() {
        HealthEvent event = compute(view(config(null, 9.0, null), 7.65));

        assertThat(event.healthScore()).isEqualTo(70);
        assertThat(event.status()).isEqualTo("watch");
        assertThat(event.worstSensorId()).isEqualTo(SENSOR);
        assertThat(event.reasons()).containsExactly("Spindle vibration is at 85% of its limit");
    }

    @Test
    void sitsAtWarningRightAtTheLimit() {
        HealthEvent event = compute(view(config(null, 9.0, null), 9.0));

        assertThat(event.healthScore()).isEqualTo(40);
        assertThat(event.status()).isEqualTo("warning");
    }

    @Test
    void isCriticalOnceTheLimitIsCrossed() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = stateWith(9.5);
        state.active.put(Rule.MAX_EXCEEDED, new SensorState.ActiveCondition(AlertEvent.CRITICAL));

        HealthEvent event = compute(new HealthCalculator.SensorView(config, state));

        assertThat(event.healthScore()).isZero();
        assertThat(event.status()).isEqualTo("critical");
        assertThat(event.reasons()).containsExactly("Spindle vibration is above its maximum of 9 mm/s");
    }

    @Test
    void staysCriticalWhileTheAlertIsStillOpenEvenIfOneReadingDipped() {
        SensorConfig config = config(null, 9.0, null);
        SensorState state = stateWith(8.0);
        state.active.put(Rule.MAX_EXCEEDED, new SensorState.ActiveCondition(AlertEvent.CRITICAL));

        assertThat(compute(new HealthCalculator.SensorView(config, state)).status()).isEqualTo("critical");
    }

    @Test
    void theWorstSensorDecidesTheScore() {
        SensorConfig calm = config(SENSOR, "Calm", null, 100.0, null);
        SensorConfig bad = config(OTHER_SENSOR, "Bad", null, 9.0, null);
        SensorState badState = stateWith(10.0);
        badState.active.put(Rule.MAX_EXCEEDED, new SensorState.ActiveCondition(AlertEvent.CRITICAL));

        HealthEvent event = compute(view(calm, 20.0), new HealthCalculator.SensorView(bad, badState));

        assertThat(event.healthScore()).isZero();
        assertThat(event.worstSensorId()).isEqualTo(OTHER_SENSOR);
    }

    @Test
    void usesTheDistanceFromTheMiddleWhenThereAreTwoLimits() {
        SensorConfig range = config(10.0, 90.0, null);

        assertThat(compute(view(range, 50.0)).healthScore()).isEqualTo(100);
        HealthEvent nearTheEdge = compute(view(range, 88.0));
        assertThat(nearTheEdge.healthScore()).isEqualTo(50);
        assertThat(nearTheEdge.status()).isEqualTo("watch");
    }

    @Test
    void worksForAMinimumOnlySensor() {
        HealthEvent event = compute(view(config(10.0, null, null), 12.0));

        assertThat(event.healthScore()).isEqualTo(73);
        assertThat(event.status()).isEqualTo("watch");
    }

    @Test
    void anActiveRateAlertCapsTheScoreAtFifty() {
        SensorState state = stateWith(5.0);
        state.active.put(Rule.RATE_OF_CHANGE, new SensorState.ActiveCondition(AlertEvent.WARNING));

        HealthEvent event = compute(new HealthCalculator.SensorView(config(null, 100.0, 2.0), state));

        assertThat(event.healthScore()).isEqualTo(50);
        assertThat(event.status()).isEqualTo("watch");
        assertThat(event.reasons()).containsExactly("Spindle vibration is changing faster than its limit");
    }

    @Test
    void aSilentSensorCostsHalfTheScore() {
        SensorState state = stateWith(5.0);
        state.active.put(Rule.SENSOR_OFFLINE, new SensorState.ActiveCondition(AlertEvent.WARNING));

        HealthEvent event = compute(new HealthCalculator.SensorView(config(null, 100.0, null), state));

        assertThat(event.healthScore()).isEqualTo(50);
        assertThat(event.reasons()).containsExactly("Spindle vibration has stopped reporting");
    }

    @Test
    void listsAtMostThreeReasonsWorstFirst() {
        List<HealthCalculator.SensorView> views = new java.util.ArrayList<>();
        String[] ids = {"6acbb105eed04b44409d2541", "6acbb105eed04b44409d2542", "6acbb105eed04b44409d2543", "6acbb105eed04b44409d2544"};
        double[] values = {8.1, 8.4, 8.7, 8.9};
        for (int i = 0; i < ids.length; i++) {
            views.add(view(config(ids[i], "Sensor " + i, null, 9.0, null), values[i]));
        }

        HealthEvent event = calculator.compute(ORG, PLANT, MACHINE, views, T0);

        assertThat(event.reasons()).hasSize(3);
        assertThat(event.reasons().get(0)).startsWith("Sensor 3");
        assertThat(event.worstSensorId()).isEqualTo(ids[3]);
    }

    @Test
    void mapsScoresToTheDocumentedBands() {
        assertThat(HealthCalculator.statusFor(100)).isEqualTo("healthy");
        assertThat(HealthCalculator.statusFor(80)).isEqualTo("healthy");
        assertThat(HealthCalculator.statusFor(79)).isEqualTo("watch");
        assertThat(HealthCalculator.statusFor(50)).isEqualTo("watch");
        assertThat(HealthCalculator.statusFor(49)).isEqualTo("warning");
        assertThat(HealthCalculator.statusFor(20)).isEqualTo("warning");
        assertThat(HealthCalculator.statusFor(19)).isEqualTo("critical");
        assertThat(HealthCalculator.statusFor(0)).isEqualTo("critical");
    }
}
