#!/bin/bash
#
# Tech Finance News - Pipeline Runner
#
# This script is designed to be called from server crontab (e.g., Dokploy)
# It runs the news processing pipeline once and exits
#
# Example crontab entry (Mon-Fri at 8h, 11h, 14h, 17h, 20h Paris time):
# 0 8,11,14,17,20 * * 1-5 /path/to/scripts/run-pipeline.sh >> /var/log/tech-finance-news.log 2>&1
#
# For Dokploy with Docker:
# 0 8,11,14,17,20 * * 1-5 docker compose -f /path/to/docker-compose.yml run --rm app

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables if .env exists
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "WARNING: OPENAI_API_KEY is not set, summarization will be skipped"
fi

if [ -z "$NOTION_API_KEY" ] || [ -z "$NOTION_DATABASE_ID" ]; then
    echo "WARNING: Notion credentials not set, push to Notion will be skipped"
fi

# Run the pipeline
echo "=========================================="
echo "Tech Finance News Pipeline"
echo "Started at: $(date)"
echo "=========================================="

cd "$PROJECT_DIR"

# Run with Node.js
if [ -f "dist/index.js" ]; then
    node dist/index.js --run
else
    echo "ERROR: dist/index.js not found. Run 'npm run build' first."
    exit 1
fi

echo "=========================================="
echo "Pipeline completed at: $(date)"
echo "=========================================="
