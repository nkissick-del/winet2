# Multi-stage Docker build for Winet2
# Stage 1: Build TypeScript application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./

# Copy source code first (needed for prepare script)
COPY src/ ./src/
COPY .eslintrc.json .eslintignore .prettierrc.js ./

# Install dependencies (including devDependencies for building)
# The prepare script will automatically run and compile TypeScript
RUN npm ci

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S winet2 && \
    adduser -S winet2 -u 1001 -G winet2

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/build/ ./build/

# Copy runtime data files
COPY modbus-metric-definitions.json modbus-registers.json ./
COPY tools/modbus-discovery/modbus-register-defaults.json tools/modbus-discovery/

# Copy additional files needed at runtime
COPY analyze-certificates.js quick-ssl-check.sh run.sh ./
RUN chmod +x quick-ssl-check.sh run.sh

# Set ownership to non-root user
RUN chown -R winet2:winet2 /app

# Switch to non-root user
USER winet2

# Expose any ports if needed (none required for this app)
# EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV TZ=Australia/Sydney

# Health check to verify application is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command - run the application
CMD ["node", "build/src/index.js"]
