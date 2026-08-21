FROM oven/bun:1

WORKDIR /app

# System deps: ffmpeg (audio/video processing) + yt-dlp (downloader, needs python3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
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

ENV DATABASE_URL="file:./prisma/data/dev.db"

RUN bunx prisma migrate deploy
RUN bunx prisma generate

CMD bunx prisma migrate deploy && bun run index.ts