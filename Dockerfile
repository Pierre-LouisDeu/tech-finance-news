# Tech Finance News Aggregator
# Multi-stage build for optimized production image
#
# This image runs in one-shot mode, designed to be triggered by server crontab
# Connects to external PostgreSQL database via DATABASE_URL

# ============================================
# Stage 1: Build
# ============================================
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-slim AS production

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright browsers
RUN npx playwright install chromium

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy SQL schema file (not included by TypeScript compilation)
COPY src/db/schema.sql ./dist/db/schema.sql

# Create logs directory
RUN mkdir -p /app/logs && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Default command: service mode (stays alive for Dokploy scheduler)
# Scheduler executes: node dist/index.js --run
CMD ["node", "dist/index.js"]
