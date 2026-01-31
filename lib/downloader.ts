import { $ } from 'bun'
import { mkdirSync, readdirSync } from 'fs'

export async function downloadMedia(url: string, outPath: string, type: 'audio' | 'video' = 'audio') {
  const ytDlpPath = (await $`which yt-dlp`).text().trim()

  const dir = outPath.substring(0, outPath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true }) // ensure directory exists

  // Pick worst-quality streams
  const format = type === 'audio' ? 'worstaudio[ext=m4a]/worstaudio' : 'bv*[height<=144]+ba/bestvideo+bestaudio/best'

  const result = await $`
    ${ytDlpPath} \
      --quiet \
      --js-runtimes node \
      -f ${format} \
      -o ${outPath} \
      ${url}
  `

  if (result.exitCode !== 0) {
    throw new Error(`yt-dlp failed: ${result.stderr}`)
  }

  const basePattern = outPath.substring(outPath.lastIndexOf('/') + 1).replace('%(ext)s', '')
  const files = readdirSync(dir)
  const file = files.find((f) => f.startsWith(basePattern))

  if (!file) throw new Error('No file was downloaded by yt-dlp')

  return `${dir}/${file}`
}
