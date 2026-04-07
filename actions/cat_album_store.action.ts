import { type TelegramClient } from '@mtcute/bun'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { getPath } from '../lib/path'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'

export class CatAlbumStoreAction implements TelegramAction {
  public static readonly slug = 'v1.cat_bucket_dump'
  public static readonly meta = { description: 'Upload an image to a bucket of cats. Hahahaha' }

  constructor(private readonly tg: TelegramClient) {}

  authorize(envelope: Envelope) {
    return true
  }

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const replyTo = await envelope.msg.getReplyTo()
    const media = replyTo?.media

    if (!media) {
      return
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👀' })

    if (media.type === 'photo') {
      const dir = join(getPath().downloads, 'photo')
      await mkdir(dir, { recursive: true })

      const fileId = media.fileId
      const filePath = join(dir, fileId)
      Bun.file(filePath).writer()
      await this.tg.downloadToFile(filePath, media)

      const form = new FormData()
      form.append('image', Bun.file(filePath))
      // expiration=600&
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
        method: 'POST',
        body: form
      })

      const data = await res.json()
      console.log(data)
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    return
  }
}
