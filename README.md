# Winet2 to Home Assistant via MQTT

Bridge Sungrow Winet/Winet‑S/Winet‑S2 gateways to Home Assistant using MQTT Discovery.

- **What it is**: A Node.js/TypeScript service that connects to Winet devices over WebSocket, polls live metrics, and publishes HA‑compatible MQTT topics.
- **Why**: Auto‑create sensors in Home Assistant without cloud dependencies.
- **How**: WebSocket to Winet → parse/normalize → MQTT publish (config + state).

## ✨ Features

- 🔄 **Multi-inverter support** with automatic device discovery
- 🔐 **SSL/TLS security** with flexible certificate validation
- 🔑 **MQTT authentication** support
- 📊 **29+ sensor types** per inverter (power, voltage, current, temperature, etc.)
- 🛡️ **Robust error handling** with graceful recovery
- ⚡ **Performance optimized** with efficient data structures

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

# Optional: MQTT authentication
MQTT_USER=your_mqtt_user
MQTT_PASS=your_mqtt_password

# Optional: Custom inverter credentials (default: admin/pw8888)
WINET_USER=admin
WINET_PASS=pw8888
```

### 2. Install and Run
```bash
npm install
npm run cli
```

Home Assistant will auto-discover entities via MQTT Discovery under `homeassistant/sensor/...`.

## 🔗 Multiple Inverters

Set a comma-separated list of hosts via `WINET_HOSTS`:

```bash
# Multiple inverter setup
WINET_HOSTS=192.168.1.10,192.168.1.11,192.168.1.12
MQTT_URL=mqtt://192.168.1.101:1883

# Optional: Custom names for each inverter
WINET_NAMES=House,Shed,Garage

# Optional: Customize discovery prefix
HA_PREFIX=homeassistant/sensor
```

**Features:**
- ⚡ **Staggered startup** prevents network congestion
- 🔄 **Independent connections** per inverter
- 📊 **Unique sensor paths** prevent conflicts
- 🏷️ **Custom naming** for easy identification

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

### Environment Variables
```bash
# Required
WINET_HOST=192.168.1.114                    # Single inverter IP/hostname
WINET_HOSTS=192.168.1.10,192.168.1.11     # Multi-inverter (overrides WINET_HOST)
MQTT_URL=mqtt://192.168.1.101:1883        # MQTT broker URL

# Authentication
MQTT_USER=mqtt_username                     # MQTT authentication (optional)
MQTT_PASS=mqtt_password                     # MQTT password (optional)
WINET_USER=admin                           # Inverter username (default: admin)
WINET_PASS=pw8888                          # Inverter password (default: pw8888)

# Customization
WINET_NAMES=House,Garage,Shed             # Custom inverter names (optional)
HA_PREFIX=homeassistant/sensor             # MQTT discovery prefix (default)
POLL_INTERVAL=10                           # Polling interval in seconds (default: 10)

# Privacy & System
ANALYTICS=false                            # Disable telemetry (default: true)
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

## 🔧 Supported Hardware & Sensors

### Inverter Models
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

#### 🔧 **Complete TypeScript Rewrite**
- **Converted from JavaScript to TypeScript** for improved type safety and developer experience
- **Full type definitions** for all data structures, device schemas, and API responses
- **Zod schema validation** for runtime type checking and data validation
- **Enhanced IntelliSense** and compile-time error detection

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
- **State management** with dirty flag tracking for efficient updates
- **Retention policies** and optimal publishing strategies

#### 🔧 **Developer Experience**
- **Google TypeScript Style (GTS)** for consistent code formatting
- **Comprehensive linting** with ESLint and Prettier integration
- **Build automation** with TypeScript compilation and validation
- **Development tooling** for testing and debugging

### Development Notes

This enhanced version was developed with a focus on code quality, maintainability, and expanded features, building on the original foundation.

### Contributing
- Original concept and protocol: **Nick Stallman**
- TypeScript rewrite and enhancements: [Nathan Kissick](https://github.com/nkissick) (with AI assistance)
- All improvements maintain backward compatibility with Nick's original configuration format

---

## 📄 License

This project builds upon and extends the work of Nick Stallman's original winet-extractor. Please ensure to respect any licensing terms from the original project when using this enhanced version.
