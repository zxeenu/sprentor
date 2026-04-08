import { type TelegramClient } from '@mtcute/bun'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'
import type { AuthService } from '..'

export class ImageBBGetAction implements TelegramAction {
  public static readonly slug = 'v1.imgbb_get_link'
  public static readonly command = '.imgbb-link'
  public static readonly meta = { description: 'Get link imgbb dump' }

  constructor(
    private readonly tg: TelegramClient,
    private readonly auth: AuthService
  ) {}

  async authorize(envelope: Envelope) {
    return await this.auth.isAuthenticated(envelope)
  }

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')
    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    this.tg.replyText(envelope.msg, 'https://zxeenu.imgbb.com/')
    return
  }
}
