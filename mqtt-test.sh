#!/bin/bash
# Test script to monitor MQTT discovery messages
# Replace MQTT_HOST, MQTT_USER, MQTT_PASS with your broker details

MQTT_HOST="your-mqtt-broker-ip"
MQTT_USER="your-username"
MQTT_PASS="your-password"

echo "Monitoring MQTT discovery messages for both inverters..."
echo "Press Ctrl+C to stop"

mosquitto_sub -h "$MQTT_HOST" -u "$MQTT_USER" -P "$MQTT_PASS" -t "homeassistant/sensor/+/+/config" -v