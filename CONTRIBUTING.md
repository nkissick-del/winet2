# Contributing to Winet2

Thank you for your interest in contributing to Winet2! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Debugging](#debugging)

## Development Setup

### Prerequisites

- **Node.js**: Version 20 or higher (LTS recommended)
- **npm**: Version 8 or higher
- **Git**: For version control

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/nkissick-del/winet2.git
   cd winet2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Compile TypeScript**
   ```bash
   npm run compile
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## Project Structure

```
winet2/
├── src/                      # Source code (TypeScript)
│   ├── index.ts             # Main application entry point
│   ├── winetHandler.ts      # WebSocket connection handler
│   ├── homeassistant.ts     # MQTT publisher for Home Assistant
│   ├── modbusReader.ts      # Modbus TCP client
│   ├── getProperties.ts     # i18n properties fetcher
│   ├── sslConfig.ts         # SSL/TLS configuration
│   ├── analytics.ts         # Telemetry (PostHog)
│   ├── metrics.ts           # Prometheus metrics collector
│   └── types/               # TypeScript type definitions
│       ├── MessageTypes.ts  # Zod schemas for validation
│       ├── Constants.ts     # Application constants
│       ├── DeviceStatus.ts  # Device data structures
│       └── HaTypes.ts       # Home Assistant types
├── test/                    # Unit tests
├── tools/                   # Development tools
│   └── modbus-discovery/    # Modbus register discovery
├── build/                   # Compiled JavaScript output
├── .github/workflows/       # CI/CD pipelines
└── README.md               # Main documentation
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Changes

- Write clean, well-documented code
- Follow the existing code style (enforced by `gts`)
- Add tests for new functionality
- Update documentation as needed

### 3. Run Quality Checks

```bash
# Compile TypeScript
npm run compile

# Run linter
npm run lint

# Auto-fix linting issues
npm run fix

# Run tests
npm test
```

### 4. Commit Changes

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "feat: add support for new inverter model"
# or
git commit -m "fix: handle timeout in WebSocket reconnection"
```

**Commit message format:**
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions or modifications
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run only TypeScript compilation
npm run compile

# Run only linting
npm run lint
```

### Writing Tests

Tests are located in the `test/` directory and use Node.js native test runner.

**Example test:**

```typescript
import {describe, it} from 'node:test';
import assert from 'node:assert';

describe('MyFeature', () => {
  it('should do something correctly', () => {
    const result = myFunction();
    assert.strictEqual(result, expectedValue);
  });
});
```

### Test Coverage Areas

- Configuration validation
- Type safety and schema validation
- MQTT discovery configuration
- SSL/TLS configuration
- Modbus register discovery
- Error handling scenarios

## Code Style

This project uses **Google TypeScript Style (gts)**.

### Key Style Guidelines

1. **Indentation**: 2 spaces (no tabs)
2. **Line length**: 80 characters (enforced by Prettier)
3. **Quotes**: Single quotes for strings
4. **Semicolons**: Required
5. **Trailing commas**: Required in multi-line objects/arrays
6. **Type annotations**: Required for function parameters and return types

### Auto-Formatting

```bash
# Fix linting and formatting issues
npm run fix
```

### TypeScript Best Practices

- Use strict type checking
- Avoid `any` types (use `unknown` if needed)
- Prefer `const` over `let`
- Use interfaces for object shapes
- Export types when used across modules
- Use Zod for runtime validation

## Submitting Changes

### Pull Request Process

1. **Ensure all tests pass**
   ```bash
   npm test
   ```

2. **Update documentation**
   - Update README.md if adding features
   - Add/update inline comments
   - Update CHANGELOG.md

3. **Push to your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Create Pull Request**
   - Go to GitHub and create a PR
   - Fill in the PR template
   - Link related issues
   - Request review

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No merge conflicts

## Debugging

### Enable Debug Logging

Set log level to debug in `src/index.ts`:

```typescript
const logger = winston.createLogger({
  level: 'debug',  // Change from 'info' to 'debug'
  // ...
});
```

### Common Issues

**TypeScript compilation errors:**
```bash
# Clean build artifacts
npm run clean
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
# Rebuild
npm run compile
```

**WebSocket connection issues:**
- Check `SSL_VALIDATION` mode
- Verify `WINET_HOST` is reachable
- Check firewall settings

**MQTT publishing issues:**
- Verify MQTT broker is running
- Check MQTT_URL, MQTT_USER, MQTT_PASS
- Test with MQTT client (mosquitto_sub)

### Testing with Docker

```bash
# Build Docker image
docker build -t winet2:dev .

# Run with environment file
docker run --rm --env-file .env winet2:dev
```

### Metrics Monitoring

Enable metrics for observability:

```bash
METRICS_ENABLED=true
METRICS_PORT=9090
```

Access metrics:
- Prometheus metrics: http://localhost:9090/metrics
- Health check: http://localhost:9090/health

## Adding New Features

### Adding Support for New Inverter Models

1. **Update Device Type Stages** (`src/types/Constants.ts`)
   ```typescript
   export const DeviceTypeStages = new Map([
     // ... existing entries
     [123, ['real', 'direct']], // New inverter type
   ]);
   ```

2. **Add Modbus Registers** (`modbus-register-defaults.json`)
   - Add register definitions for new model
   - Test with discovery tool

3. **Test** with actual hardware or mock data

### Adding New Sensors

1. **Update property mappings** in `getProperties.ts`
2. **Add device class** in `homeassistant.ts` if needed
3. **Update tests** to include new sensors

## Questions or Issues?

- **Bug reports**: https://github.com/nkissick-del/winet2/issues
- **Discussions**: https://github.com/nkissick-del/winet2/discussions
- **Security issues**: Email maintainer directly (see README)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
