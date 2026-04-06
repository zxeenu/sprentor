import type { Envelope } from './router'

export interface TelegramAction {
  slug: string
  meta: Record<string, any>
  handle(envelope: Envelope): Promise<void> | void
}
