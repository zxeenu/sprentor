#!/bin/sh
set -e
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Create it first with DB_PATH and DOWNLOADS_PATH set."
  exit 1
fi
# Load variables from .env
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
if [ -z "$DB_PATH" ] || [ -z "$DOWNLOADS_PATH" ]; then
  echo "Error: DB_PATH or DOWNLOADS_PATH is empty in $ENV_FILE"
  exit 1
fi
echo "Creating: $DB_PATH"
mkdir -p "$DB_PATH"
echo "Creating: $DOWNLOADS_PATH"
mkdir -p "$DOWNLOADS_PATH"
echo "Done. Folders ready."