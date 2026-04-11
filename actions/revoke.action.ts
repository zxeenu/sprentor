import type { TelegramClient } from '@mtcute/bun'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'
import type { AuthService } from '../services/auth.service'
import type { ConfigService } from '../services/config.service'
import type { PrismaClient } from '../lib/generated/prisma/client'

export class RevokeAction implements TelegramAction {
  public static readonly slug = 'v1.revoke_access'
  public static readonly command = ['.revoke']
  public static readonly meta = { description: 'revoke access' }

  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaClient,
    private readonly tg: TelegramClient
  ) {}

  async authorize(envelope: Envelope) {
    return await this.auth.isAuthenticated(envelope)
  }

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')

    // console.log(envelope.msg)
    const chatId = envelope.msg.chat.id
    const replyTo = await envelope.msg.getReplyTo()
    const userName = replyTo?.sender.username

    const actionCommandSeg = envelope.msg.text.split(' ')
    const actionCommandSlug = actionCommandSeg.at(1)
    if (!actionCommandSlug) {
      this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
      return
    }

    if (!userName) {
      this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
      return
    }

    const actionSlug = this.config.commandHandlers?.[actionCommandSlug]
    if (!actionSlug) {
      this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👎' })
      return
    }

    const existingGrant = await this.prisma.chatAccessGrant.findFirst({
      where: {
        action_slug: actionSlug,
        chat_id: String(chatId),
        user_name: userName,
        deleted_at: null
      }
    })

    if (!existingGrant) {
      await this.prisma.chatAccessGrant.create({
        data: {
          action_slug: actionSlug,
          chat_id: String(chatId),
          user_name: userName,
          deleted_at: new Date()
        }
      })
    }
    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    return
  }
}
