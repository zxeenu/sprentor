import { TelegramClient } from '@mtcute/bun'
import { Dispatcher } from '@mtcute/dispatcher'
import { Subject, timer } from 'rxjs'
import { filter, map, mergeMap, scan, share, tap, withLatestFrom } from 'rxjs/operators'
import { DownloadVideoAction } from './actions/download_video.action'
import { ImageBBGetAction } from './actions/img_bb_get.action'
import { ImgBBStoreAction } from './actions/img_bb_store.action'
import { createEnvelope } from './lib/envelope'
import { registerControllers } from './lib/register_controller'
import { createRouter, type Envelope } from './lib/router'
import { tryCatch } from './lib/try_catch'
import type { SlugString } from './lib/types'
import { AuthService } from './services/auth.service'
import { ConfigService } from './services/config.service'
import { EventEmitter, type CommandDispatch, type CommandFailed, type CommandSucceeded, type DomainEvent, type TelegramMessageReceived } from './services/event_emitter.service'
import { GrantAction } from './actions/grant.action'
import { RevokeAction } from './actions/revoke.action'
import { PrismaClient } from './lib/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { GrantToGroupAction } from './actions/grant_to_group.action'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? ''
})
const prisma = new PrismaClient({ adapter })

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
// Biz logic setup
// -----------------------------
const router = createRouter()

const REGISTERED_ACTIONS = [
  { cls: ImgBBStoreAction, deps: [TelegramClient, AuthService, PrismaClient] },
  { cls: ImageBBGetAction, deps: [TelegramClient, AuthService, PrismaClient] },
  { cls: DownloadVideoAction, deps: [TelegramClient, AuthService, PrismaClient] },
  { cls: GrantAction, deps: [ConfigService, AuthService, PrismaClient, TelegramClient] },
  { cls: GrantToGroupAction, deps: [ConfigService, AuthService, PrismaClient, TelegramClient] },
  { cls: RevokeAction, deps: [ConfigService, AuthService, PrismaClient, TelegramClient] }
]

// -----------------------------
// Telegram command to function handlers
// -----------------------------
const COMMAND_HANDLERS: Record<string, SlugString> = REGISTERED_ACTIONS.reduce((current, object) => {
  const keys = object.cls.command

  const handlerTempObj = keys.reduce((_current, _object) => {
    return {
      ..._current,
      [_object]: object.cls.slug
    }
  }, {})

  return {
    ...current,
    ...handlerTempObj
  }
}, {})
console.log(COMMAND_HANDLERS)

// Configs
const config = new ConfigService()
config.setCommandHandlers(COMMAND_HANDLERS)

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
// Register dependencies
// -----------------------------
router.registerSingleton(AuthService)
router.registerDependency(EventEmitter, 'singleton', () => new EventEmitter(eventBus$))
router.registerDependency(TelegramClient, 'singleton', () => tg)
router.registerDependency(ConfigService, 'singleton', () => config)
router.registerDependency(PrismaClient, 'singleton', () => prisma)

// request scope dep resolution is broken. fix later

// -----------------------------
// Route Reg
// -----------------------------
registerControllers(router, REGISTERED_ACTIONS)

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
    const { data, error } = await tryCatch(router.dispatch(e.payload.route, e.payload.env))
    // const result = await router.dispatch(e.payload.route, e.payload.env)
    if (error) {
      console.error(error)
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
