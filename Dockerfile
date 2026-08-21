FROM oven/bun:1

WORKDIR /app

# System deps: ffmpeg (audio/video processing) + yt-dlp (downloader)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install JS deps first for better layer caching
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy the rest of the app (includes prisma/schema.prisma + migrations)
COPY . .

# Make sure the data subfolder exists (this is what gets bind-mounted at runtime)
RUN mkdir -p prisma/data

# Build-time DB URL, matches the mounted subfolder at runtime.
# Overridden at runtime by the real value in .env.docker (should match).
ENV DATABASE_URL="file:./prisma/data/dev.db"

# Create the DB at build time by applying migrations, then generate the client
RUN bunx prisma migrate deploy
RUN bunx prisma generate

# Re-run migrations at container start (idempotent), then start the app
CMD bunx prisma migrate deploy && bun run index.ts