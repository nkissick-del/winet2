# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive configuration validation with detailed error messages
- Request timeout handling (30s) for WebSocket requests with automatic reconnection
- Prometheus metrics endpoint for monitoring and observability
- Unit test suite for configuration validation, MQTT publisher, and SSL config
- GitHub Actions CI/CD pipeline (test, lint, Docker build, security audit)
- `.env.example` file with comprehensive documentation
- `CONTRIBUTING.md` guide for developers
- Metrics collector with HTTP endpoint on port 9090
- Health check endpoint at `/health`
- Type safety improvements with exported `DeviceRecord` type
- Better error messages with actionable context and examples

### Changed
- Fixed import style inconsistencies (converted `require` to ES6 imports)
- Removed emojis from production logs for better log parsing
- Standardized logging levels across modules
- Improved type annotations for callback functions
- Enhanced configuration validation with warnings for suspicious values
- Updated test command to include new test files

### Fixed
- Missing type exports for `DeviceRecord` and `DeviceStatusMap`
- Inconsistent logging patterns
- Generic error messages without context
- Potential stuck connections without timeout handling

## [2.0.0] - 2024-10-22

### Added
- Multi-inverter support with independent connections per device
- Modbus TCP integration for smart meter reading
- SSL/TLS support with three validation modes (bypass, pinned, strict)
- Certificate pinning for enhanced security
- Staggered startup for multiple inverters to prevent network congestion
- Watchdog mechanism for detecting and recovering from stuck connections
- Comprehensive error handling with analytics tracking
- Home Assistant Energy Dashboard compatibility
- Docker deployment with multi-stage build
- Node.js 20 LTS support
- TypeScript 5.x with strict type checking
- Zod runtime validation for WebSocket messages
- Performance optimizations (Set/Map for O(1) lookups)

### Changed
- Complete TypeScript rewrite from original JavaScript
- Migrated from callbacks to modern async/await patterns
- Improved error handling and recovery mechanisms
- Enhanced logging with Winston
- Optimized memory management with proper timer cleanup

### Fixed
- Memory leaks from uncleaned timers
- Connection instability issues
- SSL certificate validation problems
- MQTT topic naming inconsistencies

## [1.0.0] - Initial Release

### Added
- Basic WiNet WebSocket connection
- MQTT publishing to Home Assistant
- Single inverter support
- Device discovery
- Basic error handling

---

## Version History Summary

- **v2.0.0**: Major rewrite in TypeScript with multi-inverter support
- **Unreleased**: Code quality improvements, testing, and observability

[unreleased]: https://github.com/nkissick-del/winet2/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/nkissick-del/winet2/releases/tag/v2.0.0
[1.0.0]: https://github.com/nkissick-del/winet2/releases/tag/v1.0.0
