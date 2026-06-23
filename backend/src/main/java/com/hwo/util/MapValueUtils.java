package com.hwo.util;

public final class MapValueUtils {

    private MapValueUtils() {}

    public static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    public static boolean booleanValue(Object value, boolean fallback) {
        if (value instanceof Boolean b) return b;
        if (value != null) return Boolean.parseBoolean(String.valueOf(value));
        return fallback;
    }

    public static int intValue(Object value, int fallback) {
        if (value instanceof Number number) return number.intValue();
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    public static Integer integerValue(Object value, Integer fallback) {
        if (value instanceof Number number) return number.intValue();
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
