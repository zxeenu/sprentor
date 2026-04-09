import type { Subject } from 'rxjs'
import type { Envelope } from '../lib/router'
import type { SlugString } from '../lib/types'

// -----------------------------
// Types
// -----------------------------
export type TelegramMessageReceived = {
  type: 'telegram.message.received'
  payload: Envelope
}

export type CommandDispatch = {
  type: 'command.dispatch'
  payload: {
    route: `v${number}.${string}`
    env: Envelope
  }
}

export type CommandSucceeded = {
  type: 'command.succeeded'
  payload: Envelope
}

export type CommandFailed = {
  type: 'command.failed'
  payload: {
    env: Envelope
    error: unknown
  }
}

export type DomainEvent = TelegramMessageReceived | CommandDispatch | CommandSucceeded | CommandFailed

export class EventEmitter {
  constructor(private eventBus$: Subject<DomainEvent>) {}

  emit(event: DomainEvent) {
    this.eventBus$.next(event)
  }

  emitCommand(route: SlugString, env: Envelope) {
    this.emit({ type: 'command.dispatch', payload: { route, env } })
  }
}
