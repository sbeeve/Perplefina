#!/bin/sh
set -e

echo "Starting Perplexica..."

# Run migrations only if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  node migrate.js || echo "Migration failed, continuing anyway..."
else
  echo "No DATABASE_URL set, skipping migrations..."
fi

echo "Starting Next.js server..."
exec node server.js