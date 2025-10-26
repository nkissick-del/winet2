# Docker Deployment Guide

## Using Pre-Built Images from GitHub Container Registry

The easiest way to run winet2 is using our pre-built Docker images published to GitHub Container Registry.

### Quick Start

```bash
docker pull ghcr.io/nkissick-del/winet2:latest
```

### Docker Run

```bash
docker run -d \
  --name winet2 \
  --network host \
  --restart unless-stopped \
  -e WINET_HOST=192.168.1.100 \
  -e MQTT_URL=mqtt://192.168.1.10:1883 \
  -v /path/to/cache:/data/cache \
  ghcr.io/nkissick-del/winet2:latest
```

### Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  winet2:
    image: ghcr.io/nkissick-del/winet2:latest
    container_name: winet2
    network_mode: host
    restart: unless-stopped
    environment:
      # Required
      - WINET_HOSTS=192.168.1.100,192.168.1.101
      - MQTT_URL=mqtt://192.168.1.10:1883

      # Optional - Inverter Names
      - WINET_NAMES=inverter_1,inverter_2

      # Optional - MQTT Authentication
      - MQTT_USER=homeassistant
      - MQTT_PASS=your_password

      # Optional - Modbus TCP
      - MODBUS_IPS=192.168.1.100,192.168.1.101
      - INVERTER_TYPE=STRING

      # Optional - Performance
      - POLL_INTERVAL=10
      - PROPERTIES_CACHE_ENABLED=true

      # Optional - Prometheus Metrics
      - METRICS_ENABLED=false
      - METRICS_PORT=9090

    volumes:
      - ./cache:/data/cache

    # Optional - Expose metrics port (if METRICS_ENABLED=true)
    # ports:
    #   - "9090:9090"
```

Then run:
```bash
docker-compose up -d
```

### Unraid Template

1. Add the template URL in Unraid's Docker tab:
   ```
   https://raw.githubusercontent.com/nkissick-del/winet2/main/winet2-unraid-template.xml
   ```

2. Search for "winet2" in Community Applications

3. Configure your inverter IPs and MQTT settings

4. Click "Apply" - the image will be pulled from GitHub Container Registry automatically

### Available Tags

- `latest` - Latest stable release from main branch
- `v2.0.0` - Specific version tag
- `v2` - Latest v2.x.x release
- `main` - Latest commit on main branch (development)

### Image Details

- **Registry**: GitHub Container Registry (ghcr.io)
- **Base Image**: node:20-alpine
- **Size**: ~150MB compressed
- **Architecture**: linux/amd64
- **User**: Non-root (uid 1001)

### Building Locally

If you prefer to build the image yourself:

```bash
# Clone the repository
git clone https://github.com/nkissick-del/winet2.git
cd winet2

# Build the image
docker build -t winet2:local .

# Run using local image
docker run -d \
  --name winet2 \
  --network host \
  --restart unless-stopped \
  -e WINET_HOST=192.168.1.100 \
  -e MQTT_URL=mqtt://192.168.1.10:1883 \
  winet2:local
```

### Configuration

See [.env.example](.env.example) for all available configuration options.

### Volumes

- `/data/cache` - Persistent property cache (improves startup time)

### Ports

- `9090/tcp` - Prometheus metrics endpoint (optional, only if METRICS_ENABLED=true)

### Health Check

The container includes a health check that runs every 30 seconds. View status:

```bash
docker inspect --format='{{.State.Health.Status}}' winet2
```

### Logs

View container logs:

```bash
docker logs -f winet2
```

### Troubleshooting

**Image pull fails:**
```bash
# Ensure you're authenticated (only needed for private repos)
docker login ghcr.io
```

**Container won't start:**
```bash
# Check logs
docker logs winet2

# Verify configuration
docker inspect winet2
```

**MQTT connection issues:**
```bash
# Test MQTT connectivity from container
docker exec winet2 ping your-mqtt-broker

# Check MQTT credentials
docker exec winet2 env | grep MQTT
```

### Updates

Update to the latest version:

```bash
docker pull ghcr.io/nkissick-del/winet2:latest
docker stop winet2
docker rm winet2
# Run with same parameters as before
```

With Docker Compose:
```bash
docker-compose pull
docker-compose up -d
```

### Security

- Container runs as non-root user (uid 1001)
- No privileged access required
- Minimal Alpine Linux base image
- Regular automated builds with security updates

## Support

- Issues: https://github.com/nkissick-del/winet2/issues
- Discussions: https://github.com/nkissick-del/winet2/discussions
