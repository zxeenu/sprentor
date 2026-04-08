import { type TelegramClient } from '@mtcute/bun'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { AuthService } from '..'
import { getPath } from '../lib/path'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'

export class ImgBBStoreAction implements TelegramAction {
  public static readonly slug = 'v1.img_bb_store'
  public static readonly command = '.imgbb'
  public static readonly meta = { description: 'Upload an imgbb. Hahahaha' }

  constructor(
    private readonly tg: TelegramClient,
    private readonly auth: AuthService
  ) {}

  async authorize(envelope: Envelope) {
    return await this.auth.isAuthenticated(envelope)
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
