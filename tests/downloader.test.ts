import { expect, test } from 'bun:test'
import { $ } from 'bun'
import { downloadMedia } from '../lib/downloader'

test('yt-dlp is available', async () => {
  const version = await $`yt-dlp --version`
  expect(version.stdout.toString()).toMatch(/\d+/)
})

test(
  'yt-dlp audio download',
  async () => {
    const file = await downloadMedia('https://youtube.com/watch?v=dQw4w9WgXcQ', '/tmp/downloads/yt-audio.%(ext)s', 'audio')
    const info = Bun.file(file)
    expect(info.size).toBeGreaterThan(0)
  },
  {
    'timeout': 20000
  }
)

test(
  'yt-dlp video download',
  async () => {
    const file = await downloadMedia('https://youtube.com/watch?v=dQw4w9WgXcQ', '/tmp/downloads/yt-video.%(ext)s', 'video')
    const info = Bun.file(file)
    expect(info.size).toBeGreaterThan(0)
  },
  {
    'timeout': 20000
  }
)
