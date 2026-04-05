import { InputMedia, type TelegramClient } from '@mtcute/bun'
import { hashString } from '../lib/helpers'
import { downloadMediaObject } from '../lib/downloader'
import { getPath } from '../lib/path'
import type { Envelope } from '../lib/router'
import { readdir } from 'fs/promises'
import { join } from 'path'

export class DownloadVideoController {
  public slug = 'v1.download_stream_video'
  public meta = { description: 'Download and stream video' }

  constructor(private tg: TelegramClient) {}

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const text = envelope.msg.text ?? ''
    const replyTo = await envelope.msg.getReplyTo()
    const replyText = replyTo?.text ?? ''

    const downloadLink = (() => {
      const textSeg = text.split(' ')
      const replySeg = replyText.split(' ')
      const linkSeg = textSeg.at(1)
      if (linkSeg) return { link: linkSeg, msgId: envelope.msg.id }
      const replyLinkSeg = replySeg.at(0)
      if (replyLinkSeg) return { link: replyLinkSeg, msgId: replyTo?.id! }
      return null
    })()

    if (!downloadLink) {
      return this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👀' })

    const linkHash = hashString(downloadLink.link)
    const path = join(getPath().downloads, linkHash)

    // --- check if folder exists and has any file ---
    let file: string | null = null
    try {
      const files = await readdir(path)
      const fileName = files.at(0)
      if (fileName) {
        file = join(path, fileName) // take the first file
      }
    } catch {
      // folder does not exist; file remains null
    }

    // --- download if folder empty or doesn't exist ---
    if (!file) {
      file = await downloadMediaObject(downloadLink.link, {
        dir: path,
        filename: linkHash,
        type: 'video',
        withExtension: false
      })
      if (!file) return this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
    }

    await this.tg.sendMedia(envelope.msg.chat.id, InputMedia.video(`file://${file}`, { supportsStreaming: true, caption: 'Here you go', supportsStreaming: true }), { replyTo: downloadLink.msgId })

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    return null
  }
}
