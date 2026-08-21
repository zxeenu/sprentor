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

# Copy the rest of the app (includes prisma/schema.prisma)
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Run migrations, then start the app
CMD bunx prisma migrate deploy && bun run index.ts