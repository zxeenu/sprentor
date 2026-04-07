import 'reflect-metadata'
import { TelegramClient } from '@mtcute/bun'
import { Dispatcher } from '@mtcute/dispatcher'
import { Subject, timer } from 'rxjs'
import { filter, map, mergeMap, scan, share, tap, withLatestFrom } from 'rxjs/operators'
import { createEnvelope } from './lib/envelope'
import { registerControllers } from './lib/register_controller'
import { createRouter, type Envelope } from './lib/router'
import { CatAlbumGetAction } from './actions/cat_album_get.action'
import { CatAlbumStoreAction } from './actions/cat_album_store.action'
import { DownloadVideoAction } from './actions/download_video.action'

// -----------------------------
// Types
// -----------------------------
type TelegramMessageReceived = {
  type: 'telegram.message.received'
  payload: Envelope
}

type CommandDispatch = {
  type: 'command.dispatch'
  payload: {
    route: `v${number}.${string}`
    env: Envelope
  }
}

type CommandSucceeded = {
  type: 'command.succeeded'
  payload: Envelope
}

type CommandFailed = {
  type: 'command.failed'
  payload: {
    env: Envelope
    error: unknown
  }
}

type DomainEvent = TelegramMessageReceived | CommandDispatch | CommandSucceeded | CommandFailed

const TelegramMessageReceived = (env: Envelope): TelegramMessageReceived => ({
  type: 'telegram.message.received',
  payload: env
})

const CommandSucceeded = (env: Envelope): CommandSucceeded => ({
  type: 'command.succeeded',
  payload: env
})

const CommandFailed = (env: Envelope, error: unknown): CommandFailed => ({
  type: 'command.failed',
  payload: { env, error }
})

// -----------------------------
// Telegram command to function handlers
// -----------------------------
const COMMAND_HANDLERS = {
  '.dlv': 'v1.download_stream_video',
  '.cat': 'v1.cat_bucket_dump',
  '.cat-link': 'v1.cat_bucket_get_link'
} as const

// -----------------------------
// Telegram client
// -----------------------------
const tg = new TelegramClient({
  apiId: process.env.TELEGRAM_API_ID! as any,
  apiHash: process.env.TELEGRAM_API_HASH! as any
})
const dp = Dispatcher.for(tg)

// -----------------------------
// Sources
// -----------------------------
const eventBus$ = new Subject<DomainEvent>()

// -----------------------------
// Biz logic setup
// -----------------------------
const router = createRouter()

class Logger {
  log(msg: string) {
    console.log('Log:', msg)
  }
}

class Service {
  doSomething() {
    console.log('Service action')
  }
}

class AuthService {
  isAuthenticated(data: Envelope) {
    if (data.username !== process.env.ADMIN_USER_NAME) {
      return false
    }

    return true
  }
}

class EventEmitter {
  constructor(private eventBus$: Subject<DomainEvent>) {}

  emit(event: DomainEvent) {
    this.eventBus$.next(event)
  }

  emitCommand(route: `v${number}.${string}`, env: Envelope) {
    this.emit({ type: 'command.dispatch', payload: { route, env } })
  }
}

// -----------------------------
// Register dependencies
// -----------------------------
router.registerSingleton(Logger)
router.registerSingleton(AuthService)
router.registerDependency(EventEmitter, 'singleton', () => new EventEmitter(eventBus$))
router.registerDependency(TelegramClient, 'singleton', () => tg)
// request scope dep resolution is broken. fix later
router.registerSingleton(Service)

// -----------------------------
// Route Reg
// -----------------------------
registerControllers(router, [
  { cls: CatAlbumGetAction, deps: [TelegramClient] },
  { cls: CatAlbumStoreAction, deps: [TelegramClient] },
  { cls: DownloadVideoAction, deps: [TelegramClient] }
])

// -----------------------------
// Middleware
// -----------------------------
router.registerMiddleware('v1.auth', [AuthService], async ({ deps: [auth], envelope, next }) => {
  // if (!auth.isAuthenticated(envelope)) {
  //   throw new Error('Unauthorized')
  // }

  if (!envelope.isAuthorized) {
    throw new Error('Unauthorized')
  }

  next()
})

router.registerMiddleware('v1.response', [AuthService], async ({ deps: [auth], envelope, next }) => {
  // console.log('response-log', envelope)
  next()
})

router.registerErrorHandler((obj) => {
  console.log('Something went wrong...', obj)
})

// -----------------------------
// Business logic: mark failed messages
// -----------------------------
const dispatch$ = eventBus$.pipe(
  filter((e): e is CommandDispatch => e.type === 'command.dispatch'),
  mergeMap(async (e) => {
    const result = await router.dispatch(e.payload.route, e.payload.env)
    if (!result.success) {
      return CommandFailed(e.payload.env, e.payload.env.errors)
    }
    return CommandSucceeded(e.payload.env)
  }, 1),
  tap((ev) => eventBus$.next(ev)), // push results back into the bus
  share()
)

// -----------------------------
// Compute per-user error rate
// -----------------------------
// TODO: Prevent unbounded memory growth. Add cleanup logic later
const errorRate$ = eventBus$.pipe(
  filter((e): e is CommandSucceeded | CommandFailed => e.type === 'command.succeeded' || e.type === 'command.failed'),
  scan(
    (acc, e) => {
      const env = e.type === 'command.failed' ? e.payload.env : e.payload

      const username = env.username

      if (!acc.users[username]) {
        acc.users[username] = { total: 0, errors: 0 }
      }

      acc.users[username].total++
      if (e.type === 'command.failed') {
        acc.users[username].errors++
      }

      return acc
    },
    { users: {} as Record<string, { total: number; errors: number }> }
  ),
  map((acc) => {
    const rates: Record<string, number> = {}
    for (const [user, stats] of Object.entries(acc.users)) {
      rates[user] = stats.total === 0 ? 0 : stats.errors / stats.total
    }
    return rates
  }),
  tap((rates) => console.log('Current per-user error rates:', rates)),
  share()
)

// -----------------------------
// Adaptive throttle configuration
// -----------------------------
const CONFIG = {
  dropThreshold: 0.4, // drop messages if user error rate exceeds
  delays: [
    { rate: 0.2, delay: 3000 },
    { rate: 0.1, delay: 1000 },
    { rate: 0, delay: 200 } // default
  ]
}

// -----------------------------
// Adaptive throttle per user
// -----------------------------
const adaptiveThrottled$ = eventBus$.pipe(
  filter((e): e is CommandSucceeded => e.type === 'command.succeeded'),
  withLatestFrom(errorRate$),
  mergeMap(([e, rates]) => {
    const env = e.payload
    const userRate = rates[env.username] ?? 0

    if (userRate > CONFIG.dropThreshold) {
      console.warn(`Dropping message from ${env.username}`)
      return []
    }

    const delayMs = CONFIG.delays.find((d) => userRate >= d.rate)?.delay ?? 200

    return timer(delayMs).pipe(map(() => env))
  }),
  tap((env) => console.log('Processed:', env.messageText))
)

// -----------------------------
// Hook into Telegram messages
// -----------------------------
dp.onNewMessage((msg) => {
  try {
    const env = createEnvelope()
    env.messageText = msg.text
    env.username = msg.sender.username ?? ''
    env.msg = msg

    const cmd = env.messageText.split(' ').at(0)
    const route = COMMAND_HANDLERS[cmd as keyof typeof COMMAND_HANDLERS]

    if (!route) {
      return
    }

    eventBus$.next({
      type: 'command.dispatch',
      payload: { route, env }
    })
  } catch (err) {
    console.error('Failed to push update:', err)
  }
})

// -----------------------------
// Start Telegram client
// -----------------------------
await tg.start()

// -----------------------------
// Subscribe to the final stream
// -----------------------------
dispatch$.subscribe()
adaptiveThrottled$.subscribe()
