# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records (ADRs) for the Winet2 project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences.

## ADR Index

1. [ADR-001: Use Zod for Runtime Validation](001-use-zod-for-runtime-validation.md) - Why we chose Zod for schema validation
2. [ADR-002: Adopt Google TypeScript Style](002-adopt-google-typescript-style.md) - Code style and linting decisions
3. [ADR-003: WebSocket-Based Communication](003-websocket-based-communication.md) - Protocol choice for WiNet communication
4. [ADR-004: Metrics Collection with Prometheus](004-metrics-collection-prometheus.md) - Observability and monitoring approach

## Decision Status Legend

- **Proposed**: Under discussion
- **Accepted**: Decision made and implemented
- **Deprecated**: No longer recommended
- **Superseded**: Replaced by a newer decision

## ADR Template

When creating a new ADR, use the following template:

```markdown
# ADR-XXX: Title

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?

### Positive
- Benefit 1
- Benefit 2

### Negative
- Drawback 1
- Drawback 2

## Alternatives Considered
What other options were considered and why were they not chosen?
```
