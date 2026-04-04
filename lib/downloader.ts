import { $ } from 'bun'
import { mkdirSync, readdirSync, unlinkSync } from 'fs'
import { extname, join } from 'path'

type DownloadOptions = {
  dir: string
  filename: string
  type?: 'audio' | 'video'
  withExtension?: boolean
}

export async function downloadMediaObject(url: string, options: DownloadOptions) {
  const { dir, filename, type = 'audio', withExtension = true } = options

  const ytDlpPath = (await $`which yt-dlp`).text().trim()

  mkdirSync(dir, { recursive: true })

  const outTemplate = join(dir, `${filename}.%(ext)s`)

  const format = type === 'audio' ? 'worstaudio[ext=m4a]/worstaudio' : 'bv*[ext=mp4]+ba/bestvideo+bestaudio/best'

  const result = await $`
    ${ytDlpPath} \
      --quiet \
      --js-runtimes node \
      -f ${format} \
      --merge-output-format mp4 \
      -o ${outTemplate} \
      ${url}
  `

  if (result.exitCode !== 0) {
    throw new Error(`yt-dlp failed: ${result.stderr}`)
  }

  const files = readdirSync(dir)
  const file = files.find((f) => f.startsWith(filename))

  if (!file) throw new Error('No file was downloaded by yt-dlp')

  const fullPath = join(dir, file)

  if (withExtension) return fullPath

  // remove temp files if needed
  for (const f of readdirSync(dir)) {
    const path = join(dir, f)
    if (f.startsWith(filename) && path !== fullPath) {
      try {
        unlinkSync(path)
      } catch {}
    }
  }

  return fullPath
}

// export async function downloadMediaObject(url: string, options: DownloadOptions) {
//   const { dir, filename, type = 'audio', withExtension = true } = options

//   const ytDlpPath = (await $`which yt-dlp`).text().trim()

//   mkdirSync(dir, { recursive: true })

//   const outTemplate = join(dir, `${filename}.%(ext)s`)

//   const format = type === 'audio' ? 'worstaudio[ext=m4a]/worstaudio' : 'bv*[height<=144]+ba/bestvideo+bestaudio/best'

//   const result = await $`
//     ${ytDlpPath} \
//       --quiet \
//       --js-runtimes node \
//       -f ${format} \
//       -o ${outTemplate} \
//       ${url}
//   `

//   if (result.exitCode !== 0) {
//     throw new Error(`yt-dlp failed: ${result.stderr}`)
//   }

//   const files = readdirSync(dir)
//   const file = files.find((f) => f.startsWith(filename))

//   if (!file) throw new Error('No file was downloaded by yt-dlp')

//   const fullPath = join(dir, file)

//   if (withExtension) {
//     return fullPath
//   }

//   const finalFile = join(dir, file) // the merged file

//   // remove all other files that start with filename but are not finalFile
//   for (const f of readdirSync(dir)) {
//     const path = join(dir, f)
//     if (f.startsWith(filename) && path !== finalFile) {
//       try {
//         unlinkSync(path)
//       } catch {} // remove temp file
//     }
//   }

//   // const ext = extname(file)
//   // return join(dir, file.slice(0, -ext.length))
//   return join(dir, file)
// }

export async function downloadMedia(url: string, outPath: string, type: 'audio' | 'video' = 'audio') {
  const ytDlpPath = (await $`which yt-dlp`).text().trim()

  const dir = outPath.substring(0, outPath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true }) // ensure directory exists

  // Pick worst-quality streams
  const format = type === 'audio' ? 'worstaudio[ext=m4a]/worstaudio' : 'bv*[height<=144]+ba/bestvideo+bestaudio/best'
  // const format = type === 'audio' ? 'worstaudio' : 'worst[height<=144]'

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
