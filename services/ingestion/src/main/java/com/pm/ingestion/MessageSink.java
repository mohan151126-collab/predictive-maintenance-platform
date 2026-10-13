package com.pm.ingestion;

public interface MessageSink {

    void send(String topic, String key, String value);
}
