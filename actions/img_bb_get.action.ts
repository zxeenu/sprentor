import { type TelegramClient } from '@mtcute/bun'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'
import type { AuthService } from '../services/auth.service'
import type { PrismaClient } from '../lib/generated/prisma/client'
import { getTelegramMsgPolicyData } from '../lib/helpers'

export class ImageBBGetAction implements TelegramAction {
  public static readonly slug = 'v1.imgbb_get_link'
  public static readonly command = ['.imgbb-link']
  public static readonly meta = { description: 'Get link imgbb dump' }

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
          action_slug: ImageBBGetAction.slug
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
    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    this.tg.replyText(envelope.msg, 'https://zxeenu.imgbb.com/')
    return
  }
}
