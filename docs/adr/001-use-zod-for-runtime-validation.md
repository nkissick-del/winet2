# ADR-001: Use Zod for Runtime Validation

## Status
Accepted

## Context
TypeScript provides excellent compile-time type safety, but it cannot validate data at runtime. The application receives data from external WebSocket connections (WiNet devices) that may not match expected schemas, either due to:
- Different firmware versions returning different data structures
- Network corruption
- Malformed responses from devices
- New device types with unknown structures

Without runtime validation, invalid data could cause:
- Application crashes
- Silent data corruption
- Incorrect MQTT publishing to Home Assistant
- Difficult-to-debug issues

## Decision
Use Zod (v4.x) for runtime schema validation of all WebSocket messages and external data.

All message types are defined using Zod schemas in `src/types/MessageTypes.ts`:
- `ConnectSchema` - Connection handshake validation
- `LoginSchema` - Authentication response validation
- `DeviceListSchema` - Device discovery validation
- `RealtimeSchema` - Real-time metrics validation
- `DirectSchema` - MPPT string data validation

Validation is performed using `safeParse()` rather than `parse()` to avoid throwing exceptions:

```typescript
const result = ConnectSchema.safeParse(data);
if (!result.success) {
  this.logger.error('Schema validation failed:', result.error);
  return; // Graceful degradation
}
```

## Consequences

### Positive
- **Runtime Safety**: Catches malformed data before it causes issues
- **Excellent TypeScript Integration**: Types are inferred from schemas using `z.infer<>`
- **Self-Documenting**: Schemas serve as documentation for expected data structures
- **Helpful Error Messages**: Zod provides detailed validation errors for debugging
- **Version Compatibility**: Can handle different firmware versions gracefully
- **Production Stability**: Prevents crashes from unexpected data

### Negative
- **Additional Dependency**: Adds ~60KB to bundle size
- **Runtime Overhead**: Validation has small performance cost (~1-2ms per message)
- **Learning Curve**: Team must learn Zod syntax
- **Schema Maintenance**: Schemas must be updated when API changes

## Alternatives Considered

### 1. TypeScript-only (No Runtime Validation)
- **Pros**: No additional dependencies, zero runtime overhead
- **Cons**: No protection against invalid data at runtime, silent failures
- **Rejected**: Too risky for production use with external devices

### 2. Custom Validation Functions
- **Pros**: Full control, no dependencies
- **Cons**: Much more code to write and maintain, error-prone, no type inference
- **Rejected**: Reinventing the wheel

### 3. JSON Schema + ajv
- **Pros**: Industry standard, very fast
- **Cons**: Poor TypeScript integration, separate schema definitions from types
- **Rejected**: Worse developer experience than Zod

### 4. io-ts
- **Pros**: Similar to Zod, good TypeScript integration
- **Cons**: More complex API, larger bundle, less active development
- **Rejected**: Zod has better DX and ecosystem

## Implementation Notes
- All schemas use `.strict()` to reject unknown fields
- Use `.safeParse()` instead of `.parse()` to avoid exceptions
- Log validation errors with context for debugging
- Analytics tracking of validation failures helps identify firmware issues

## References
- Zod documentation: https://zod.dev
- TypeScript runtime validation comparison: https://www.npmjs.com/package/zod
