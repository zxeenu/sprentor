import { Photo, type TelegramClient } from '@mtcute/bun'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { getPath } from '../lib/path'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'
import type { AuthService } from '../services/auth.service'
import type { PrismaClient } from '../lib/generated/prisma/client'
import { getTelegramMsgPolicyData } from '../lib/helpers'

export class ImgBBStoreAction implements TelegramAction {
  public static readonly slug = 'v1.img_bb_store'
  public static readonly command = ['.imgbb', '.steal', '.yoink']
  public static readonly meta = { description: 'Upload an imgbb. Hahahaha' }

  constructor(
    private readonly tg: TelegramClient,
    private readonly auth: AuthService,
    private readonly prisma: PrismaClient
  ) {}

  async authorize(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const payload = getTelegramMsgPolicyData(envelope.msg)
    if (payload) {
      const isAllowed = await this.prisma.chatAccessGrant.count({
        where: {
          chat_id: String(payload.chatId),
          user_name: payload.userName,
          action_slug: ImgBBStoreAction.slug
        }
      })

      if (isAllowed > 0) {
        return true
      }
    }

    return await this.auth.isAuthenticated(envelope)
  }

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const replyTo = await envelope.msg.getReplyTo()
    const groupId = replyTo?.groupedId

    if (groupId) {
      await this.albumMediaHandle(envelope)
      return
    }
    await this.singleMediaHandle(envelope)
  }

  async downloadImage(media: Photo) {
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

  async albumMediaHandle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const replyTo = await envelope.msg.getReplyTo()
    const groupId = replyTo?.groupedId

    if (!groupId) {
      throw new Error('Group id could not be found')
    }

    const groupMsg = await this.tg.getMessageGroup({
      'chatId': replyTo.chat.id,
      'message': replyTo.id
    })

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👀' })

    let hasDownloaded = false
    for (const msg of groupMsg) {
      const media = msg.media

      if (media?.type === 'photo') {
        await this.downloadImage(media)
        hasDownloaded = true
      }
    }

    if (hasDownloaded) {
      this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
      return
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
  }

  async singleMediaHandle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    const replyTo = await envelope.msg.getReplyTo()
    const media = replyTo?.media

    if (!media) {
      return
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👀' })

    if (media.type === 'photo') {
      await this.downloadImage(media)
      this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
      return
    }

    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
    return
  }
}
