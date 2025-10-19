# Home Assistant MQTT Integration Troubleshooting

## Current Status
- winet2 is successfully publishing discovery messages for both inverters
- Home Assistant at 192.168.1.101 is not showing the devices
- MQTT integration has been reloaded
- Container has been restarted

## Step-by-Step Troubleshooting

### 1. Verify MQTT Broker Configuration
Check if Home Assistant can connect to your MQTT broker:

**In Home Assistant:**
- Go to Settings → Devices & Services → MQTT
- Check connection status
- Look for any error messages

### 2. Check Home Assistant Logs
Look for MQTT-related errors:

**In Home Assistant:**
- Go to Settings → System → Logs
- Search for "mqtt" or "discovery"
- Look for errors around the time winet2 started

### 3. Verify MQTT Discovery is Enabled
Ensure MQTT discovery is enabled in configuration.yaml:

```yaml
mqtt:
  discovery: true
```

### 4. Check MQTT Topic Structure
Our app publishes to these topics:
- Discovery: `homeassistant/sensor/inverter1/inverter1_sg50rs_a22c1208335/total_active_power/config`
- State: `homeassistant/sensor/inverter1/inverter1_sg50rs_a22c1208335/state`

### 5. Manual MQTT Verification
Test if HA receives MQTT messages at all by publishing a test message.

### 6. Check Device Registry
Sometimes devices appear but are hidden:
- Go to Settings → Devices & Services → MQTT → Devices
- Look for devices starting with "SG50RS"

### 7. Force Discovery Refresh
Try clearing MQTT discovery cache:
- Developer Tools → Services
- Call service: `mqtt.reload`

## Common Issues & Solutions

### Issue: Discovery Messages Not Processing
**Solution:** Check if HA MQTT discovery prefix matches ours (`homeassistant`)

### Issue: Devices Created But No Entities
**Solution:** Check entity registry for disabled entities

### Issue: Old Cached Discovery
**Solution:** Restart Home Assistant completely

### Issue: MQTT Broker Authentication
**Solution:** Verify MQTT credentials match between winet2 and HA

## Next Steps
Let's check these items systematically to identify the root cause.