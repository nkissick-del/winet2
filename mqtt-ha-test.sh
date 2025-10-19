#!/bin/bash
# MQTT Connection Test Script for Home Assistant Integration

echo "=== MQTT Connection Test ==="
echo "This script will test MQTT connectivity and discovery message publishing"
echo

# Configuration - UPDATE THESE VALUES
MQTT_HOST="192.168.1.101"  # Your HA IP or MQTT broker IP
MQTT_PORT="1883"
MQTT_USER="your_mqtt_username"
MQTT_PASS="your_mqtt_password"

echo "Testing connection to MQTT broker..."
echo "Host: $MQTT_HOST:$MQTT_PORT"

# Test 1: Basic connection
echo
echo "=== Test 1: Basic MQTT Connection ==="
timeout 5 mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "test/connection" -m "test message"
if [ $? -eq 0 ]; then
    echo "✅ Basic MQTT connection successful"
else
    echo "❌ MQTT connection failed - check broker settings"
    exit 1
fi

# Test 2: Subscribe to Home Assistant discovery topics
echo
echo "=== Test 2: Monitoring HA Discovery Topics ==="
echo "Subscribing to Home Assistant discovery topics for 10 seconds..."
echo "You should see winet2 discovery messages if they're being published..."
timeout 10 mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" -t "homeassistant/+/+/+/config" -v

# Test 3: Publish a test discovery message
echo
echo "=== Test 3: Test Discovery Message ==="
echo "Publishing a test sensor discovery message..."

TEST_DISCOVERY='{
  "name": "Test Inverter Power",
  "state_topic": "homeassistant/sensor/test_inverter/test_inverter_test/state",
  "unique_id": "test_inverter_power",
  "unit_of_measurement": "W",
  "device_class": "power",
  "state_class": "measurement",
  "device": {
    "identifiers": ["test_inverter"],
    "name": "Test Inverter",
    "model": "Test Model"
  },
  "value_template": "{{ value_json.value }}"
}'

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" \
    -t "homeassistant/sensor/test_inverter/test_inverter_test/power/config" \
    -m "$TEST_DISCOVERY" \
    -r

echo "✅ Test discovery message published"
echo "   Check Home Assistant → Settings → Devices & Services → MQTT"
echo "   Look for 'Test Inverter' device"

# Test 4: Publish test state data
echo
echo "=== Test 4: Test State Data ==="
mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$MQTT_USER" -P "$MQTT_PASS" \
    -t "homeassistant/sensor/test_inverter/test_inverter_test/state" \
    -m '{"value": 1500}'

echo "✅ Test state data published"

echo
echo "=== Next Steps ==="
echo "1. Check if 'Test Inverter' appears in Home Assistant"
echo "2. If test works but winet2 doesn't, there may be a topic structure issue"
echo "3. Check Home Assistant logs for any MQTT discovery errors"