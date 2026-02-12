import { Subject, timer } from 'rxjs'
import { filter, map, mergeMap, scan, share, tap, withLatestFrom } from 'rxjs/operators'
import { createRouter, type Envelope } from '../lib/router'

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
// Sources
// -----------------------------
export const eventBus$ = new Subject<DomainEvent>()

// -----------------------------
// Biz logic setup
// -----------------------------
export const router = createRouter()

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
// request scope dep resolution is broken. fix later
// router.registerDependency(Service, 'request-scoped', () => Service)
router.registerSingleton(Service)

// -----------------------------
// Middleware
// -----------------------------
router.registerMiddleware('v1.auth', [AuthService], async ({ deps: [auth], envelope, next }) => {
  if (!auth.isAuthenticated(envelope)) throw new Error('Unauthorized')
  // envelope['v1.auth.1'] = 'hallo'
  next()
})

router.registerMiddleware('v1.auth', [AuthService], async ({ deps: [auth], envelope, next }) => {
  // envelope['v1.auth.2'] = 'i saw this'
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
// Route
// -----------------------------
router.registerRoute(
  'v1.download_stream_video',
  [Logger, Service, EventEmitter],
  async ({ envelope, deps: [logger, service, emitter] }) => {
    // logger.log('Dispatching test route')
    // service.doSomething()
    // console.log(envelope)
    // throw new Error('fuck you bro')
    console.log('download stream video')
    emitter.emitCommand('v1.howdy', envelope)
    // emitter.emitCommand('v1.download_stream_video', envelope)
  },
  ['v1.auth'],
  ['v1.response']
)

router.registerRoute('v1.howdy', [], async ({ envelope, deps: [] }) => {
  console.log('from inside v1.howdy')
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
// Subscribe to the final stream
// -----------------------------
dispatch$.subscribe()
adaptiveThrottled$.subscribe()
