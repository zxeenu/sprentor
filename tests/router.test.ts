import { expect, test } from 'bun:test'
import { createRouter } from '../lib/router'
import { createEnvelope } from '../lib/envelope'

test('dependency injector injects correct class instances into middleware and route', async () => {
  const router = createRouter()

  class Logger {
    id = Math.random()
    log(msg: string) {
      console.log('Log:', msg)
    }
  }

  router.registerSingleton(Logger)

  let middlewareLogger: Logger | null = null
  let routeLogger: Logger | null = null

  router.registerMiddleware('v1.logger', [Logger], async ({ deps: [logger], next }) => {
    middlewareLogger = logger
    await next()
  })

  router.registerRoute(
    'v1.test',
    [Logger],
    async ({ deps: [logger] }) => {
      routeLogger = logger
    },
    ['v1.logger']
  )

  const envelope = createEnvelope()
  await router.dispatch('v1.test', envelope)

  // --- assertions ---
  expect(middlewareLogger).toBeInstanceOf(Logger)
  expect(routeLogger).toBeInstanceOf(Logger)

  // singleton guarantee
  expect(middlewareLogger).toBe(routeLogger)
})

test('envelope passed around by middleware pipeline and route handler can be mutated correctly', async () => {
  const router = createRouter()

  let seenInRoute: any = {} // vaiable to hold evenlope data, that will be assigned via a dispatch action

  router.registerMiddleware('v1.logger', [], async ({ envelope, next }) => {
    envelope.step1 = true
    await next()
  })

  router.registerMiddleware('v1.logger', [], async ({ envelope, next }) => {
    envelope.step2 = true
    await next()
  })

  router.registerRoute(
    'v1.test',
    [],
    async ({ envelope }) => {
      seenInRoute = structuredClone(envelope)
    },
    ['v1.logger']
  )

  const envelope = createEnvelope()
  envelope.step1 = 'howdy'
  envelope.step2 = 'hi bro'
  await router.dispatch('v1.test', envelope)

  // --- assertions ---
  // Middleware mutated the original envelope
  expect(envelope.step1).toBe(true)
  expect(envelope.step2).toBe(true)

  // Route handler saw the mutated values
  expect(seenInRoute.step1).toBe(true)
  expect(seenInRoute.step2).toBe(true)

  // Base envelope properties are preserved
  expect(seenInRoute.correlationId).toBeDefined()
})

test('error handler is invoked when middleware throws and receives correct context', async () => {
  const router = createRouter()
  const envelope = createEnvelope()

  const seen: {
    error?: unknown
    envelope?: Record<string, unknown>
    routeSlug?: string
    meta?: any
  } = {}

  router.registerErrorHandler(async ({ error, envelope, routeSlug, meta, next }) => {
    seen.error = error
    seen.envelope = envelope
    seen.routeSlug = routeSlug
    seen.meta = meta
    // do NOT call next() — stop error pipeline
  })

  router.registerMiddleware('v1.fail', [], async ({ envelope }) => {
    envelope.beforeCrash = true
    throw new Error('boom')
  })

  router.registerRoute(
    'v1.test',
    [],
    async ({ envelope }) => {
      envelope.routeRan = true // should NEVER happen
    },
    ['v1.fail'],
    undefined,
    { secure: true }
  )

  await expect(router.dispatch('v1.test', envelope)).resolves.toBeUndefined()

  // --- assertions ---
  expect(seen.error).toBeInstanceOf(Error)
  expect((seen.error as Error).message).toBe('boom')

  expect(seen.routeSlug).toBe('v1.test')
  expect(seen.meta).toEqual({ secure: true })

  // envelope mutation before crash is preserved
  expect(envelope.beforeCrash).toBe(true)

  // route must not run
  expect(envelope.routeRan).toBeUndefined()
})
