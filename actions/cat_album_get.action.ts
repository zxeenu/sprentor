import { type TelegramClient } from '@mtcute/bun'
import type { Envelope } from '../lib/router'
import type { TelegramAction } from '../lib/types'

export class CatAlbumGetAction implements TelegramAction {
  public readonly slug = 'v1.cat_bucket_get_link'
  public readonly meta = { description: 'Get link to cat album' }

  constructor(private readonly tg: TelegramClient) {}

  async handle(envelope: Envelope) {
    if (!envelope.msg) throw new Error('No msg found')
    this.tg.sendReaction({ message: envelope.msg.id, chatId: envelope.msg.chat.id, emoji: '👍' })
    this.tg.replyText(envelope.msg, 'https://zxeenu.imgbb.com/')
    return
  }
}
