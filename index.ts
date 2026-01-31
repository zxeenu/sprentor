import { TelegramClient } from '@mtcute/bun'
import { Dispatcher, MessageContext } from '@mtcute/dispatcher'
import { Subject, timer } from 'rxjs'
import { filter, map, mergeMap, scan, share, tap, withLatestFrom } from 'rxjs/operators'
import { createEnvelope } from './lib/envelope'
import { createRouter } from './lib/router'

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
  isAuthenticated(data: any) {
    return true
  }
}

// -----------------------------
// Register dependencies
// -----------------------------
router.registerSingleton(Logger)
router.registerSingleton(AuthService)
// request scope dep resolution is broken. fix later
// router.registerDependency(Service, 'request-scoped', () => Service)
router.registerSingleton(Service)

// -----------------------------
// Middleware
// -----------------------------
router.registerMiddleware('v1.auth', [AuthService], async ({ deps: [auth], envelope, next }) => {
  if (!auth.isAuthenticated(envelope)) throw new Error('Unauthorized')
  envelope['v1.auth.1'] = 'hallo'
  next()
})

router.registerMiddleware('v1.auth', [AuthService], async ({ deps: [auth], envelope, next }) => {
  envelope['v1.auth.2'] = 'i saw this'
  next()
})

router.registerMiddleware('v1.response', [AuthService], async ({ deps: [auth], envelope, next }) => {
  console.log('response-log', envelope)
  next()
})

router.registerErrorHandler((obj) => {
  console.log('Something went wrong...', obj)
})

// -----------------------------
// Route
// -----------------------------
router.registerRoute(
  'v1.download_stream_video',
  [Logger, Service],
  async ({ envelope, deps: [logger, service] }) => {
    // logger.log('Dispatching test route')
    // service.doSomething()
    // console.log(envelope)
    // throw new Error('fuck you bro')
  },
  ['v1.auth'],
  ['v1.response']
)

// -----------------------------
// Telegram command to function handlers
// -----------------------------
const COMMAND_HANDLERS = {
  '.dl': 'v1.download_stream_video'
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
const mtproto$ = new Subject<MessageContext>()

// -----------------------------
// Normalize / enrich messages
// -----------------------------
const updates$ = mtproto$.pipe(
  map((update) => {
    const env = createEnvelope()
    env.messageText = update.text
    env.username = update.sender.username ?? ''
    return env
  }),
  share()
)

// -----------------------------
// Business logic: mark failed messages
// -----------------------------
const processed$ = updates$.pipe(
  mergeMap(async (env) => {
    const wordSegments = env.messageText.split(' ')
    const commandHandler = wordSegments.at(0)
    const route = COMMAND_HANDLERS[commandHandler as keyof typeof COMMAND_HANDLERS]
    if (!route) {
      console.warn('No route for', env)
      return env
    }

    await router.dispatch(route, env)
    return env
  }, 1),
  share()
)

// -----------------------------
// Compute per-user error rate
// -----------------------------
// TODO: Prevent unbounded memory growth. Add cleanup logic later
const errorRate$ = processed$.pipe(
  scan(
    (acc, { username, failed }) => {
      if (!acc.users[username]) acc.users[username] = { total: 0, errors: 0 }
      acc.users[username].total += 1
      acc.users[username].errors += failed ? 1 : 0
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
const adaptiveThrottled$ = processed$.pipe(
  filter(({ failed }) => !failed), // only successful messages
  withLatestFrom(errorRate$), // get latest per-user error rates immediately
  mergeMap(([env, rates]) => {
    const userRate = rates[env.username] ?? 0

    if (userRate > CONFIG.dropThreshold) {
      console.warn(`Dropping message from ${env.username} due to high error rate`, env)
      return [] // skip
    }

    const delayMs = CONFIG.delays.find((d) => userRate >= d.rate)?.delay ?? 200

    // optional: use timer for visual delay
    return timer(delayMs).pipe(map(() => env))
  }),
  tap((env) => console.log('Processed:', env.messageText))
)

// -----------------------------
// Hook into Telegram messages
// -----------------------------
dp.onNewMessage((msg) => {
  try {
    mtproto$.next(msg)
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
adaptiveThrottled$.subscribe()
