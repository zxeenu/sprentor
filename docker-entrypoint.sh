#!/bin/sh
set -e

echo "Running Prisma migrations..."
bunx prisma migrate deploy

echo "Starting app..."
exec bun run index.ts