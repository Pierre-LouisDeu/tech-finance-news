# Tech Finance News Aggregator
# Multi-stage build for optimized production image

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

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/data/news.db
ENV LOG_LEVEL=info

# Health check (for container orchestrators)
HEALTHCHECK --interval=5m --timeout=10s --start-period=30s \
    CMD node -e "console.log('healthy')" || exit 1

# Default command: single run mode (for Dokploy/CRON scheduling)
# Use --scheduled for continuous internal cron scheduling
CMD ["node", "dist/index.js", "--run"]
