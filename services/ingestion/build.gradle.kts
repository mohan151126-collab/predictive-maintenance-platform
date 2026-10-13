plugins {
	java
	id("org.springframework.boot") version "4.1.1"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.pm"
version = "0.0.1-SNAPSHOT"
description = "Reads MQTT sensor readings and publishes them to Kafka"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(21)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-kafka")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("com.hivemq:hivemq-mqtt-client:1.4.0")
	implementation("com.networknt:json-schema-validator:3.0.8")
	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.springframework.boot:spring-boot-starter-kafka-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.processResources {
	from(layout.projectDirectory.dir("../../contracts")) {
		include("telemetry.schema.json")
	}
}

tasks.processTestResources {
	from(layout.projectDirectory.dir("../../contracts")) {
		include("telemetry.example.json")
	}
}

tasks.withType<Test> {
	useJUnitPlatform()
}
