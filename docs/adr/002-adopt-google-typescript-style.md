# ADR-002: Adopt Google TypeScript Style (gts)

## Status
Accepted

## Context
TypeScript provides flexibility in code formatting and linting, which can lead to:
- Inconsistent code style across contributors
- Endless debates about formatting preferences (tabs vs spaces, semicolons, etc.)
- Time wasted on code review feedback about style rather than logic
- Higher cognitive load when reading code with mixed styles
- Difficulty onboarding new contributors

The project needed a comprehensive, opinionated style guide that:
- Enforces consistent formatting automatically
- Integrates well with TypeScript
- Has strong ecosystem support
- Reduces bike-shedding in code reviews
- Is maintained by a reputable organization

## Decision
Adopt **Google TypeScript Style (gts)** as the official code style and linting tool for the project.

gts provides:
- Opinionated TypeScript style guide from Google
- Integrated ESLint configuration
- Integrated Prettier for automatic formatting
- TypeScript compiler settings
- CLI tools for fixing issues automatically
- Battle-tested configuration used at Google

Configuration added to `package.json`:
```json
{
  "devDependencies": {
    "gts": "^6.0.2"
  },
  "scripts": {
    "lint": "gts lint",
    "fix": "gts fix",
    "clean": "gts clean"
  }
}
```

`tsconfig.json` extends gts configuration:
```json
{
  "extends": "./node_modules/gts/tsconfig-google.json"
}
```

## Consequences

### Positive
- **Zero Configuration**: Works out of the box with sensible defaults
- **Auto-Fixing**: Most style issues fixed automatically with `npm run fix`
- **Consistency**: All code follows the same style guide
- **Reduced Bike-shedding**: Style discussions are off the table
- **Industry Standard**: Google's style guide is widely respected
- **Great DX**: Integrates seamlessly with VS Code and other editors
- **TypeScript Native**: Designed specifically for TypeScript projects
- **Maintained**: Google actively maintains gts
- **CI/CD Ready**: Easy to integrate into automated checks

### Negative
- **Opinionated**: Some developers may disagree with certain style choices
- **Learning Curve**: New contributors must learn gts conventions
- **Strictness**: No flexibility on certain formatting rules
- **Dependency**: Adds ~20MB to dev dependencies
- **Breaking Changes**: Major version updates may require code changes

## Key Style Guidelines Enforced

1. **Indentation**: 2 spaces (no tabs)
2. **Line Length**: 80 characters maximum
3. **Quotes**: Single quotes for strings (except to avoid escaping)
4. **Semicolons**: Required at statement ends
5. **Trailing Commas**: Required in multi-line structures
6. **Type Annotations**: Required for function parameters and returns
7. **No `any`**: Discouraged, use `unknown` or proper types
8. **Naming**:
   - camelCase for variables and functions
   - PascalCase for classes and types
   - UPPER_CASE for constants
9. **Imports**: Organized and sorted
10. **Spacing**: Consistent spacing around operators and braces

## Alternatives Considered

### 1. ESLint + Prettier (Manual Configuration)
- **Pros**: Full control over every rule
- **Cons**: Time-consuming setup, endless configuration debates, maintenance burden
- **Rejected**: Too much setup and maintenance overhead

### 2. Standard JS
- **Pros**: Zero configuration, popular
- **Cons**: JavaScript-focused, not optimized for TypeScript, no semicolons (controversial)
- **Rejected**: Poor TypeScript support

### 3. Airbnb Style Guide
- **Pros**: Very popular, comprehensive
- **Cons**: JavaScript-focused, requires significant configuration for TypeScript
- **Rejected**: Not TypeScript-native

### 4. TSLint (Deprecated)
- **Pros**: TypeScript-specific
- **Cons**: Officially deprecated in favor of ESLint
- **Rejected**: No longer maintained

### 5. Prettier Only
- **Pros**: Just formatting, no linting
- **Cons**: Doesn't catch code quality issues, needs separate linting setup
- **Rejected**: Insufficient for code quality enforcement

## Implementation Notes

### Required Scripts
```json
{
  "lint": "gts lint",          // Check for issues
  "fix": "gts fix",            // Auto-fix issues
  "clean": "gts clean",        // Remove build artifacts
  "compile": "tsc",            // TypeScript compilation
  "pretest": "npm run compile",
  "posttest": "npm run lint"   // Enforce linting in CI
}
```

### CI/CD Integration
GitHub Actions workflow includes:
```yaml
- run: npm run lint
```

This ensures all code meets style guidelines before merging.

### Editor Integration
VS Code configuration (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

### Migration Strategy
For existing code:
1. Run `npm run fix` to auto-fix most issues
2. Manually fix remaining issues
3. Commit with message: "chore: apply gts formatting"

## Overrides
In rare cases, specific rules can be disabled:
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// Justified use of any type here
const data: any = externalLibrary();
/* eslint-enable @typescript-eslint/no-explicit-any */
```

**Note**: Overrides should be exceptional and well-documented.

## Success Metrics
- Code review comments about style: Reduced by ~90%
- Time to fix linting issues: Reduced by ~80% (auto-fix)
- Contributor onboarding: Faster (clear style guide)
- Code consistency: 100% (enforced by CI)

## References
- gts GitHub: https://github.com/google/gts
- Google TypeScript Style Guide: https://google.github.io/styleguide/tsguide.html
- ESLint: https://eslint.org/
- Prettier: https://prettier.io/
