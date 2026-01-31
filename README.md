# sprentor

To install dependencies:

```bash
bun install
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

To run:

```bash
bun run index.ts
```

To test continuously:

```bash
bun test --watch
```

To run new code forever:

```bash
bun --watch index.ts
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

To run a single test forever:

```bash
bun test --watch downloader.test.ts
```
