package com.pm.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class Text {

    private Text() {}

    static String number(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    static String signed(double value) {
        return (value > 0 ? "+" : "") + number(value);
    }
}
