import type { Envelope } from './router'

type SlugString = `v${number}.${string}`

export abstract class TelegramAction {
  public static readonly slug: SlugString
  public static readonly meta: Record<string, any>
  public abstract handle(envelope: Envelope): Promise<void> | void
  public authorize?(envelope: Envelope): Promise<boolean> | boolean
}
