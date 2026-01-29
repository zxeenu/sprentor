import { createRouter } from '../lib/router'
import { expect, test } from 'bun:test'

test('DI injects correct class instances into middleware and route', async () => {
  const router = createRouter()

  class Logger {
    id = Math.random()
    log(msg: string) {
      console.log('Log:', msg)
    }
  }

  router.registerDependency(Logger, 'singleton')

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

  await router.dispatch('v1.test', {})

  // --- assertions ---
  expect(middlewareLogger).toBeInstanceOf(Logger)
  expect(routeLogger).toBeInstanceOf(Logger)

  // singleton guarantee
  expect(middlewareLogger).toBe(routeLogger)
})

test('Envelope passed around by middleware pipeline and route handler can be mutated correctly', async () => {
  const router = createRouter()

  let seenInRoute: Record<string, unknown> = {}

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
      seenInRoute = { ...envelope }
    },
    ['v1.logger']
  )

  const envelope: Record<string, unknown> = {}
  await router.dispatch('v1.test', envelope)

  // --- assertions ---
  expect(envelope.step1).toBe(true)
  expect(envelope.step2).toBe(true)

  expect(seenInRoute).toEqual({
    step1: true,
    step2: true
  })
})
