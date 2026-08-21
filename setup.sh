#!/bin/sh
set -e

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Create it first with DOCKER_VOLUME_DB_PATH and DOCKER_VOLUME_DOWNLOADS_PATH set."
  exit 1
fi

# Load variables from .env
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

if [ -z "$DOCKER_VOLUME_DB_PATH" ] || [ -z "$DOCKER_VOLUME_DOWNLOADS_PATH" ]; then
  echo "Error: DOCKER_VOLUME_DB_PATH or DOCKER_VOLUME_DOWNLOADS_PATH is empty in $ENV_FILE"
  exit 1
fi

echo "Creating: $DOCKER_VOLUME_DB_PATH"
mkdir -p "$DOCKER_VOLUME_DB_PATH"

echo "Creating: $DOCKER_VOLUME_DOWNLOADS_PATH"
mkdir -p "$DOCKER_VOLUME_DOWNLOADS_PATH"

echo "Done. Folders ready."