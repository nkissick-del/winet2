# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Winet2, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email security concerns to the maintainer:
- Create a private security advisory on GitHub
- Or contact the maintainer directly through GitHub

### What to Include

Please include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### Response Time

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity

## Security Considerations

### Network Security

#### SSL/TLS Configuration

Winet2 supports three SSL validation modes:

1. **bypass** (default)
   - Accepts self-signed certificates
   - Suitable for: Trusted local networks
   - Risk: Vulnerable to MITM on untrusted networks

2. **pinned** (recommended)
   - Validates specific certificate fingerprint
   - Suitable for: Enhanced security with self-signed certs
   - Risk: Requires manual fingerprint updates

3. **strict**
   - Full CA validation
   - Suitable for: Maximum security with valid certificates
   - Risk: May fail with self-signed certificates

**Recommendation**: Use `strict` mode in production with valid certificates, or `pinned` mode with verified fingerprints.

```bash
# Enable strict SSL validation
SSL_VALIDATION=strict

# Or use certificate pinning
SSL_VALIDATION=pinned
SSL_FINGERPRINT=AA:BB:CC:DD:...
```

#### Network Isolation

**Best Practice**: Run Winet2 on an isolated network segment:

```
Internet ← [Firewall] ← Home Network ← [VLAN/Firewall] ← IoT Network (Winet2 + Inverters)
```

### Credential Security

#### Environment Variables

Store credentials securely:

```bash
# Good: Use environment variables
export MQTT_PASS="your_secure_password"

# Bad: Hardcode in files tracked by git
MQTT_PASS=password123  # DON'T DO THIS
```

#### Docker Secrets

For Docker deployments, use secrets:

```yaml
services:
  winet2:
    secrets:
      - mqtt_password
    environment:
      - MQTT_PASS_FILE=/run/secrets/mqtt_password

secrets:
  mqtt_password:
    file: ./secrets/mqtt_password.txt
```

#### File Permissions

Ensure `.env` file has restrictive permissions:

```bash
chmod 600 .env
```

### MQTT Security

#### Authentication

Always use MQTT authentication in production:

```bash
MQTT_USER=homeassistant
MQTT_PASS=strong_random_password
```

#### Encryption

Use encrypted MQTT (MQTTS) when possible:

```bash
MQTT_URL=mqtts://mqtt.example.com:8883
```

#### Access Control

Configure MQTT broker ACLs to restrict:
- Topics Winet2 can publish to
- Topics Winet2 can subscribe to

Example Mosquitto ACL:
```
user winet2
topic write homeassistant/sensor/#
topic read homeassistant/sensor/#
```

### Container Security

#### Non-Root User

Winet2 Docker image runs as non-root user (UID 1001):

```dockerfile
USER winet2:1001
```

#### Resource Limits

Set resource limits to prevent DoS:

```yaml
services:
  winet2:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

#### Read-Only Filesystem

Run with read-only root filesystem:

```yaml
services:
  winet2:
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - winet2-data:/data  # Only /data is writable
```

### Metrics Security

#### Network Exposure

By default, metrics endpoint binds to `0.0.0.0`:

**Recommendations**:
1. Use firewall to restrict access
2. Bind to localhost only (requires code change)
3. Use reverse proxy with authentication

#### No Sensitive Data

Metrics do not expose:
- Credentials
- IP addresses (except in labels)
- Device serial numbers
- Personal information

Only aggregate counts and rates are exposed.

### Data Privacy

#### Analytics

PostHog analytics is **disabled by default**:

```bash
ANALYTICS=false
```

If enabled, only anonymous usage statistics are collected:
- Device counts
- Error types
- Connection events

**No personal data** is transmitted.

#### Properties Caching

Cached properties contain only i18n translation strings, no sensitive data.

Cache location: `/data/cache/properties_*.json`

## Security Best Practices

### Production Deployment Checklist

- [ ] Use `SSL_VALIDATION=strict` or `pinned`
- [ ] Enable MQTT authentication
- [ ] Use MQTTS for encrypted MQTT
- [ ] Disable analytics (`ANALYTICS=false`)
- [ ] Secure `.env` file permissions (`chmod 600`)
- [ ] Run on isolated network (VLAN)
- [ ] Set resource limits in Docker
- [ ] Use strong, unique passwords
- [ ] Regularly update dependencies
- [ ] Monitor logs for suspicious activity
- [ ] Implement firewall rules
- [ ] Disable unnecessary features
- [ ] Regular security audits

### Regular Maintenance

#### Update Dependencies

Check for security updates monthly:

```bash
npm audit
npm audit fix
```

#### Docker Image Updates

Rebuild Docker images regularly:

```bash
docker-compose pull
docker-compose up -d --build
```

#### Monitor Security Advisories

Subscribe to:
- GitHub security advisories for Winet2
- npm security advisories
- Docker security bulletins

## Known Security Considerations

### 1. Self-Signed Certificates

**Issue**: WiNet devices often use self-signed certificates

**Mitigation**: Use `pinned` mode with verified fingerprint

```bash
SSL_VALIDATION=pinned
SSL_FINGERPRINT=<verified_fingerprint>
```

### 2. Default WiNet Credentials

**Issue**: WiNet devices may use default credentials (`admin`/`pw8888`)

**Mitigation**: Change WiNet device passwords if possible

### 3. Local Network Trust

**Issue**: Application assumes local network is trusted

**Mitigation**: Use network segmentation (VLANs) for IoT devices

### 4. No Built-In Authentication

**Issue**: Metrics endpoint has no authentication

**Mitigation**: 
- Firewall rules to restrict access
- Reverse proxy with authentication
- Only enable metrics in trusted environments

## Compliance

### Data Protection

Winet2 processes:
- **Technical telemetry data**: Voltage, current, power, temperature
- **Device identifiers**: Serial numbers, device IDs
- **No personal data**: No names, addresses, or user information

### Data Storage

Data is:
- **Not persisted** by Winet2 (passed to MQTT only)
- **Cached temporarily** (i18n properties only)
- **Not transmitted** to external services (except opt-in PostHog)

### Third-Party Services

Only optional third-party service:
- **PostHog** (analytics) - Disabled by default

## Security Features

### Implemented

- ✅ SSL/TLS support with certificate validation
- ✅ Certificate pinning
- ✅ Non-root Docker execution
- ✅ Environment-based credential management
- ✅ Schema validation (prevents injection)
- ✅ Request timeout handling
- ✅ Watchdog for stuck connections
- ✅ Graceful error handling
- ✅ No hardcoded secrets
- ✅ Comprehensive logging (audit trail)

### Planned

- 🔄 Metrics endpoint authentication
- 🔄 Encrypted cache storage
- 🔄 Rate limiting for MQTT publishing
- 🔄 Automatic security updates

## Vulnerability Disclosure Timeline

1. **Day 0**: Vulnerability reported
2. **Day 1-2**: Initial assessment and response
3. **Day 3-7**: Develop and test fix
4. **Day 7-14**: Release security patch
5. **Day 14**: Public disclosure (if appropriate)

## Security Contacts

- **GitHub**: Create a private security advisory
- **Email**: Contact maintainer through GitHub profile

## Acknowledgments

We thank security researchers who responsibly disclose vulnerabilities.

---

**Last Updated**: 2024-10-22
**Version**: 2.0.0
