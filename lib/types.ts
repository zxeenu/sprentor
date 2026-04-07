import type { Envelope } from './router'

export interface TelegramAction {
  slug: `v${number}.${string}`
  meta: Record<string, any>
  handle(envelope: Envelope): Promise<void> | void
  authorize(envelope: Envelope): Promise<boolean> | boolean
}
