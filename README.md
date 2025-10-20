# Winet2 to Home Assistant via MQTT

**Version 2.0.0** | **Node.js 20 LTS** | **TypeScript 5.9.3** | **Zod v4**

Bridge Sungrow Winet/Winet‑S/Winet‑S2 gateways to Home Assistant using MQTT Discovery.

For detailed troubleshooting notes and register history see [DIAGNOSTICS.md](DIAGNOSTICS.md).

- **What it is**: A Node.js/TypeScript service that connects to Winet devices over WebSocket, polls live metrics, and publishes HA‑compatible MQTT topics.
- **Why**: Auto‑create sensors in Home Assistant without cloud dependencies.
- **How**: WebSocket to Winet → parse/normalize → MQTT publish (config + state).

## ✨ Features

- 🔄 **Multi-inverter support** with automatic device discovery
- � **Modbus TCP integration** for smart meter data (grid import/export energy)
- �🔐 **SSL/TLS security** with flexible certificate validation
- 🔑 **MQTT authentication** support
- 📊 **29+ sensor types** per inverter (power, voltage, current, temperature, etc.)
- 🛡️ **Robust error handling** with graceful recovery
- ⚡ **Performance optimized** with efficient data structures
- 🏷️ **Friendly sensor naming** - "Daily Yield (inverter_1)" format
- 🐳 **Docker support** with Node.js 20 LTS
- 📦 **Modern stack** - TypeScript 5.9.3, Zod v4, latest dependencies
- ⚡ **Energy Dashboard ready** - automatic device_class and state_class configuration

## 🙏 Acknowledgments

This project is built upon the excellent foundation created by **[nickstallman](https://github.com/nickstallman)** in his original [winet-extractor](https://github.com/nickstallman/home-assistant-repo/tree/main/winet-extractor) project. 

**Special thanks to Nick** for:
- Creating the original WebSocket communication protocol with Winet devices
- Developing the initial MQTT Home Assistant integration
- Establishing the core architecture for multi-device support
- Providing the foundation that made this enhanced version possible

This project represents a complete TypeScript rewrite and enhancement of Nick's original work, with performance optimizations, improved error handling, and expanded features while maintaining the core functionality he pioneered.

> **Note**: This enhanced version was developed with the assistance of AI tools to improve codebase quality, add TypeScript support, and implement performance optimizations.

## 🚀 Quick Start

### 1. Configure Environment
Create a `.env` file with minimal variables:

```bash
# Single inverter setup
WINET_HOST=192.168.1.114
MQTT_URL=mqtt://192.168.1.101:1883
INVERTER_TYPE=STRING   # or HYBRID

# Optional: Modbus smart meter (leave blank if none)
MODBUS_IPS=

# Optional: MQTT authentication
MQTT_USER=your_mqtt_user
MQTT_PASS=your_mqtt_password

# Optional: Custom inverter credentials (default: admin/pw8888)
WINET_USER=admin
WINET_PASS=pw8888
```

### 2. Docker Deployment (Recommended)
```bash
# Build and run with Docker
docker build -t winet2 .
docker run -d --name winet2-bridge --restart unless-stopped --env-file .env winet2

# Or use docker-compose
docker-compose up -d
```

### 3. Local Development
```bash
npm install
npm run compile
npm run cli  # Runs the compiled application
```

Home Assistant will auto-discover entities via MQTT Discovery under `homeassistant/sensor/...` with friendly names like:
- **"Daily Yield (inverter_1)"**
- **"Total Active Power (inverter_1)"** 
- **"Phase A Voltage (inverter_2)"**

### ✅ First-Time Setup Checklist
1. Confirm each inverter is reachable on the network (ping or web UI).
2. Decide whether the site is **STRING** or **HYBRID** and set `INVERTER_TYPE` accordingly.
3. If a Sungrow smart meter is installed, identify which inverter it is wired to and place that IP in the matching slot of `MODBUS_IPS`.
4. Test MQTT credentials by publishing a sample message (optional but helpful for first-time users).
5. Start the bridge (`docker compose up --build -d`) and watch `docker compose logs --tail 200` for `📊 Modbus meter data` entries.

## 🔗 Multiple Inverters

Set a comma-separated list of hosts via `WINET_HOSTS`:

```bash
# Multiple inverter setup
WINET_HOSTS=192.168.1.10,192.168.1.11,192.168.1.12
WINET_NAMES=inverter_1,inverter_2,inverter_3
MQTT_URL=mqtt://192.168.1.101:1883
INVERTER_TYPE=STRING   # applies to all inverters unless you run separate containers

# Modbus smart meter mapping (blank entry means no meter)
MODBUS_IPS=,192.168.1.12,   # Only inverter_2 has the chained smart meter

# Optional: Customize discovery prefix
HA_PREFIX=homeassistant/sensor
```

**Features:**
- ⚡ **Staggered startup** prevents network congestion
- 🔄 **Independent connections** per inverter
- 📊 **Unique sensor paths** prevent conflicts
- 🏷️ **Custom naming** for easy identification

**Smart Meter Pairing (String Inverters)**
- Sungrow smart meters daisy-chain to a single inverter on the RS485 bus.
- In the `.env` file, `MODBUS_IPS` must list an entry for every inverter in `WINET_HOSTS`.
  - Use the meter host (typically the inverter IP) in the slot for the inverter that owns the meter.
  - Leave the other slots blank (`''`).
- Example: if the meter is wired to `192.168.1.12`, set `MODBUS_IPS=,192.168.1.12` so the second inverter supplies meter data for the whole array.
- Only that inverter will expose `meter_power`, `grid_import_energy`, and `grid_export_energy`.


## 🔐 Security Configuration

### SSL/TLS Options
```bash
# Enable SSL (auto-detects if required)
SSL=true

# Security levels (choose one)
SSL_VALIDATION=bypass    # Default - maximum compatibility
SSL_VALIDATION=pinned    # Enhanced security with certificate pinning
SSL_VALIDATION=strict    # Maximum security (may fail with self-signed certs)

# Certificate pinning (for enhanced security)
INVERTER_CERT_FINGERPRINTS=sha256:A1:B2:C3...,sha256:D4:E5:F6...
```

### Security Levels Explained

| Level | Security | Compatibility | Use Case |
|-------|----------|---------------|----------|
| `bypass` | ⚠️ Medium-Low | ✅ Works with all inverters | Default, trusted networks |
| `pinned` | 🔒 High | ⚡ Works with known certificates | Enhanced security |
| `strict` | 🔐 Maximum | ❌ May fail with self-signed | Maximum security environments |

**💡 Tip**: Use `./quick-ssl-check.sh` to analyze your inverter certificates and get pinning recommendations.

## ⚙️ Configuration Reference

### Modbus Defaults & Discovery
- Out of the box the app loads register defaults from `tools/modbus-discovery/modbus-register-defaults.json` (built from Sungrow CSVs).
- To verify or regenerate registers on your inverter: `npm run build:register-defaults` then `node tools/modbus-discovery/discover.js`.
- The discovery CLI now asks for inverter type (`1=String`, `2=Hybrid`) and rewrites `modbus-registers.json` with validated overrides.

### Environment Variables
```bash
# Required
WINET_HOST=192.168.1.114                    # Single inverter IP/hostname
WINET_HOSTS=192.168.1.10,192.168.1.11     # Multi-inverter (overrides WINET_HOST)
MQTT_URL=mqtt://192.168.1.101:1883        # MQTT broker URL
INVERTER_TYPE=STRING                   # Register defaults: STRING or HYBRID

# Authentication
MQTT_USER=mqtt_username                     # MQTT authentication (optional)
MQTT_PASS=mqtt_password                     # MQTT password (optional)
WINET_USER=admin                           # Inverter username (default: admin)
WINET_PASS=pw8888                          # Inverter password (default: pw8888)

# Modbus TCP (optional - for smart meter data)
MODBUS_IPS=,192.168.1.12                   # One entry per inverter matching WINET_HOSTS
                                            # Use the meter owner's IP; leave others blank
                                            # Enables meter_power/grid_import/grid_export on that inverter

# Customization
WINET_NAMES=House,Garage,Shed             # Custom inverter names (optional)
HA_PREFIX=homeassistant/sensor             # MQTT discovery prefix (default)
POLL_INTERVAL=10                           # Polling interval in seconds (default: 10)

# Privacy & System
ANALYTICS=false                            # Disable telemetry (default: false)
SINGLE_PHASE_SYSTEM=true                   # Hide 3-phase sensors (optional)

# SSL/TLS Security
SSL=true                                   # Enable SSL (auto-detected if needed)
SSL_VALIDATION=bypass                      # Security level: bypass/pinned/strict
INVERTER_CERT_FINGERPRINTS=sha256:A1:B2... # Certificate pinning (pinned mode)
```

### Alternative: JSON Configuration
Create `/data/options.json` for Home Assistant add-on compatibility:
```json
{
  "winet_hosts": ["192.168.1.10", "192.168.1.11"],
  "mqtt_url": "mqtt://192.168.1.101:1883",
  "mqtt_user": "username",
  "mqtt_pass": "password",
  "poll_interval": "10",
  "analytics": false,
  "ssl": true
}
```

## 🔧 Technical Specifications

### Runtime Requirements
- **Node.js**: 20 LTS (Alpine Linux in Docker)
- **TypeScript**: 5.9.3
- **Dependencies**: Modern stack (zod v4, winston, mqtt, ws)
- **Memory**: ~50MB typical usage
- **CPU**: Minimal (polling every 10 seconds)

### Supported Hardware

#### Inverter Models
- ✅ **Sungrow SG50RS** (Type 21) - REAL + DIRECT stages
- ✅ **Winet-S/Winet-S2** devices with firmware variations
- ✅ **Auto-detection** of device capabilities and sensor types

### Sensor Types (29+ per inverter)
- 🔌 **Power**: AC/DC power, MPPT power per string
- ⚡ **Electrical**: Voltage, current, frequency, power factor
- 🌡️ **Temperature**: Inverter internal temperature
- 📊 **Energy**: Daily/total energy production
- ⚖️ **Grid**: Import/export power and energy
- 🔋 **Battery**: Status, voltage, current (if equipped)

## 🛠️ Troubleshooting

### Common Issues

**Connection Refused**
```bash
# Check if inverter is reachable
ping 192.168.1.114

# Test HTTP endpoint
curl -k http://192.168.1.114/i18n/en_US.properties
```

**SSL Certificate Errors**
```bash
# Run SSL analysis
./quick-ssl-check.sh

# Or use bypass mode temporarily
SSL_VALIDATION=bypass
```

**MQTT Authentication Failed**
```bash
# Test MQTT connection
mosquitto_pub -h your-mqtt-host -u username -P password -t test -m "hello"
```

## 🐳 Docker Deployment

### Environment Variables with Docker
```bash
# Create .env file with your configuration
cat > .env << EOF
WINET_HOSTS=192.168.1.114,192.168.1.12
WINET_NAMES=inverter_1,inverter_2
MQTT_URL=mqtt://192.168.1.101:1883
EOF

# Build and deploy
docker build -t winet2 .
docker run -d --name winet2-bridge --restart unless-stopped --env-file .env winet2
```

### Docker Compose (Recommended)
```yaml
version: '3.8'
services:
  winet2:
    build: .
    container_name: winet2-bridge
    restart: unless-stopped
    env_file: .env
    network_mode: host  # Required for inverter discovery
```

### Health Checks
The container includes built-in health monitoring:
```bash
# Check container health
docker ps | grep winet2
# Should show "healthy" status

# View logs
docker logs winet2-bridge --tail 50
```

## 🏗️ Architecture Overview

### Data Flow
```
Sungrow Winet Device → WebSocket → Node.js Service → MQTT → Home Assistant
```

### Key Components
| Module | Responsibility |
|--------|----------------|
| `index.ts` | Bootstrap, configuration loading, component orchestration |
| `winetHandler.ts` | WebSocket client, device discovery, polling stages, watchdog |
| `homeassistant.ts` | MQTT publisher, HA Discovery, unit normalization |
| `getProperties.ts` | i18n label fetching with HTTP/HTTPS fallback |
| `sslConfig.ts` | SSL/TLS certificate validation |
| `types/*` | Zod schemas, device type mappings, HA class definitions |

### Processing Pipeline
1. **Configuration Loading** - Environment variables or JSON config
2. **i18n Properties Fetching** - Human-readable labels from device
3. **WebSocket Connection** - Authentication and device discovery  
4. **Polling & Data Processing** - Continuous metrics collection with validation
5. **MQTT Publishing** - Home Assistant Discovery configs and live state data

## 📝 Project History & Changes

### Original Project
This project is based on **[winet-extractor](https://github.com/nickstallman/home-assistant-repo/tree/main/winet-extractor)** by [nickstallman](https://github.com/nickstallman), which provided the foundational WebSocket communication protocol and MQTT integration for Sungrow WiNet devices.

### Major Enhancements in winet2

#### 🔧 **Complete TypeScript Rewrite (v2.0.0)**
- **Converted from JavaScript to TypeScript** for improved type safety and developer experience
- **Full type definitions** for all data structures, device schemas, and API responses
- **Zod v4 schema validation** for runtime type checking and data validation
- **Enhanced IntelliSense** and compile-time error detection
- **Node.js 20 LTS** runtime with Alpine Linux containers

#### 🏗️ **Architecture Improvements**
- **Modular design** with separated concerns:
  - `getProperties.ts` - HTTP requests and i18n property loading
  - `winetHandler.ts` - WebSocket communication and device management
  - `homeassistant.ts` - MQTT publishing and Home Assistant discovery
  - `sslConfig.ts` - SSL/TLS certificate validation
  - `analytics.ts` - Usage tracking and error reporting

#### ⚡ **Performance Optimizations**
- **Set-based lookups** replacing O(n) array operations with O(1) performance
- **Map-based device type caching** for efficient device stage lookup
- **Batch processing** for MQTT operations and status updates
- **Memory leak prevention** with proper timer cleanup and resource management
- **Optimized data structures** reducing object allocations and GC pressure

#### 🛡️ **Enhanced Error Handling**
- **Global exception handlers** preventing application crashes
- **Graceful reconnection logic** with exponential backoff
- **Comprehensive logging** with Winston logger integration
- **Watchdog mechanisms** for detecting and recovering from stuck operations

#### 🔐 **Security Improvements**
- **Flexible SSL/TLS validation** with bypass, pinned, and strict modes
- **Certificate fingerprint pinning** for enhanced security
- **Secure credential handling** with environment variable validation
- **MQTT authentication** support with user/password credentials

#### 📊 **MQTT & Home Assistant Integration**
- **Enhanced discovery protocol** with proper device classification
- **Automatic sensor configuration** with appropriate device classes
- **Improved sensor naming** - "Sensor Name (Device)" format for clarity
- **Individual sensor topics** matching Home Assistant best practices
- **State management** with dirty flag tracking for efficient updates
- **Retention policies** and optimal publishing strategies

#### 🔧 **Developer Experience**
- **Google TypeScript Style (GTS)** for consistent code formatting
- **Comprehensive linting** with ESLint and Prettier integration
- **Build automation** with TypeScript compilation and validation
- **Development tooling** for testing and debugging

### Development Notes

This enhanced version was developed with a focus on code quality, maintainability, and expanded features, building on the original foundation.

## 🆕 What's New in v2.0.0

### Modernized Stack
- ✅ **Node.js 20 LTS** (upgraded from 18)
- ✅ **TypeScript 5.9.3** (latest stable)
- ✅ **Zod v4** (schema validation with performance improvements)
- ✅ **All dependencies updated** to latest stable versions

### Improved User Experience  
- ✅ **Better sensor naming** - "Daily Yield (inverter_1)" format
- ✅ **Cleaner MQTT topics** - individual sensor topics for better HA integration
- ✅ **Enhanced Docker support** with multi-stage builds
- ✅ **Comprehensive cleanup** - removed unused dependencies (yargs)

### Developer Experience
- ✅ **Modern linting** with Google TypeScript Style (GTS) v6
- ✅ **Type safety improvements** with latest TypeScript features
- ✅ **Performance optimizations** across all modules
- ✅ **Clean codebase** - no technical debt or redundant code

### Contributing
- Original concept and protocol: **Nick Stallman**
- TypeScript rewrite and enhancements: [Nathan Kissick](https://github.com/nkissick) (with AI assistance)
- All improvements maintain backward compatibility with Nick's original configuration format

---

## 📄 License

This project builds upon and extends the work of Nick Stallman's original winet-extractor. Please ensure to respect any licensing terms from the original project when using this enhanced version.

## 🛠️ Modbus Register Discovery & Dynamic Mapping

This app supports dynamic mapping of Modbus registers for maximum compatibility with different Sungrow inverter models and firmware versions.

### How It Works
- On first setup (or after a firmware update), run the Modbus register discovery tool:

```bash
node tools/modbus-discovery/discover.js
```
- The tool will prompt for your inverter IP, port, slave ID, scan range, and current meter values (from your inverter's web UI).
- It will scan the specified register range and auto-match values to your readings.
- Discovered register addresses are saved to `modbus-registers.json`.
- The main app will use these addresses for Modbus polling.

### Environment Variables
- `MODBUS_DISCOVERY_ON_START=true|false` — Run register scan on startup (default: false)
- `MODBUS_SCAN_START=5000` — Start of scan range (default: 5000)
- `MODBUS_SCAN_END=5700` — End of scan range (default: 5700)

You can set these in your `.env` file to control scanning behavior and range. For advanced troubleshooting, you may scan the full range (0–65535), but this is slower and not usually necessary.

### Manual Scan
You can always run the discovery tool manually to update register mappings:
```bash
node tools/modbus-discovery/discover.js
```

### Safety Note
Scanning the full Modbus register range may take several minutes and could stress the inverter. Use the default ranges unless you have a special need.

### Updating Register Addresses
If you change inverter models or update firmware and your sensors stop working, re-run the discovery tool and update your config.

---
