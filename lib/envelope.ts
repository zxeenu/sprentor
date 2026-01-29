import { nanoid } from 'nanoid'
import type { Envelope } from './router'

export function createEnvelope(data?: { [key: string]: any }): Envelope {
  return {
    ...data,
    correlationId: nanoid(),
    isCommand: data?.kind === 'message' && data?.text.startsWith('.'),
    isAdmin: false
  }
}
