#!/bin/sh
set -e

echo "==================================="
echo "Starting Perplexica..."
echo "==================================="
echo "PORT: ${PORT:-3000}"
echo "DATABASE_URL: ${DATABASE_URL:+SET}"
echo "SEARXNG_API_URL: ${SEARXNG_API_URL:-NOT_SET}"
echo "==================================="

# Run migrations only if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  node migrate.js || echo "Migration failed, continuing anyway..."
else
  echo "No DATABASE_URL set, skipping migrations..."
fi

echo "==================================="
echo "Starting Next.js server on port ${PORT:-3000}..."
echo "==================================="
exec node server.js