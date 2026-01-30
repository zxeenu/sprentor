import { test } from 'bun:test'
import { Subject, BehaviorSubject, map, share, tap, throttle, switchMap, take, timer, catchError, mergeMap, filter, of } from 'rxjs'
import { createEnvelope } from '../lib/envelope'

// test('rx dynamic throttling demo', async () => {
//   type MTUpdate = { kind: 'message'; chatId: number; text: string }

//   // -----------------------------
//   // Sources
//   // -----------------------------
//   const mtproto$ = new Subject<MTUpdate>()
//   const errorRate$ = new BehaviorSubject(0)

//   // -----------------------------
//   // Normalize / enrich
//   // -----------------------------
//   const updates$ = mtproto$.pipe(
//     map((update) => createEnvelope(update)),
//     share() // single upstream subscription
//   )

//   // -----------------------------
//   // Filter "normal messages"
//   // -----------------------------
//   const normal$ = updates$.pipe(tap((env) => console.log('Received raw envelope:', env)))

//   // -----------------------------
//   // Adaptive throttling
//   // -----------------------------
//   const adaptiveThrottle$ = errorRate$.pipe(
//     map((rate) => {
//       if (rate > 0.2) return 3000
//       if (rate > 0.1) return 1000
//       return 200
//     })
//   )

//   const throttledNormal$ = normal$.pipe(
//     throttle(() =>
//       adaptiveThrottle$.pipe(
//         take(1),
//         switchMap((ms) => timer(ms))
//       )
//     ),
//     tap((env) => console.log('Emitted after throttle:', env))
//   )

//   // -----------------------------
//   // Subscribe to consume
//   // -----------------------------
//   throttledNormal$.subscribe()

//   // -----------------------------
//   // Test events
//   // -----------------------------
//   mtproto$.next({ chatId: 1, kind: 'message', text: 'Hello' })
//   mtproto$.next({ chatId: 1, kind: 'message', text: 'How are you?' })

//   // Update error rate dynamically to see throttle change
//   setTimeout(() => {
//     console.log('Increasing error rate → slower throttle')
//     errorRate$.next(0.15)
//     mtproto$.next({ chatId: 1, kind: 'message', text: 'This should throttle longer' })
//   }, 500)

//   setTimeout(() => {
//     mtproto$.next({ chatId: 1, kind: 'message', text: 'Another quick message' })
//   }, 600)
// })

test('rx business logic + adaptive throttling demo', async () => {
  type MTUpdate = { kind: 'message'; chatId: number; text: string }

  // -----------------------------
  // Sources
  // -----------------------------
  const mtproto$ = new Subject<MTUpdate>()

  // Tracks total number of messages processed
  const totalMessages$ = new BehaviorSubject(0)
  // Tracks number of errors
  const errorCount$ = new BehaviorSubject(0)

  // -----------------------------
  // Normalize / enrich
  // -----------------------------
  const updates$ = mtproto$.pipe(
    map((update) => createEnvelope(update)),
    tap(() => totalMessages$.next(totalMessages$.value + 1)), // count total messages
    share()
  )

  // -----------------------------
  // Business logic stage
  // -----------------------------
  const processed$ = updates$.pipe(
    mergeMap((env) => {
      if (env.text.includes('fail')) {
        errorCount$.next(errorCount$.value + 1)
        throw new Error('fail')
      }
      return of(env)
    }),
    catchError((err, caught) => {
      console.error('Caught error:', err.message)
      return caught // continue the stream
    }),
    tap((env) => console.log('Business logic passed:', env?.text))
  )

  // -----------------------------
  // Compute dynamic error rate
  // -----------------------------
  const errorRate$ = errorCount$.pipe(
    map((errCount) => {
      // const total = totalMessages$.value
      // return total === 0 ? 0 : errCount / total
      return 5
    }),
    tap((rate) => console.log('Current error rate:', rate))
  )

  // -----------------------------
  // Adaptive throttling
  // -----------------------------
  const adaptiveThrottle$ = errorRate$.pipe(
    map((rate) => {
      if (rate > 0.2) return 3000
      if (rate > 0.1) return 1000
      return 200
    })
  )

  const throttled$ = processed$.pipe(
    throttle(() =>
      adaptiveThrottle$.pipe(
        take(1),
        switchMap((ms) => timer(ms))
      )
    ),
    tap((env) => console.log('Emitted after throttle:', env?.text))
  )

  // -----------------------------
  // Subscribe
  // -----------------------------
  throttled$.subscribe()

  // -----------------------------
  // Test messages
  // -----------------------------
  const messages: MTUpdate[] = [
    { chatId: 1, kind: 'message', text: 'Hello world' },
    { chatId: 1, kind: 'message', text: 'This will fail' },
    { chatId: 1, kind: 'message', text: 'Another good message' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'All good' }
  ]

  messages.forEach((msg) => mtproto$.next(msg))
})

test('rx business logic + adaptive throttling + drop demo', async () => {
  type MTUpdate = { kind: 'message'; chatId: number; text: string }

  // -----------------------------
  // Sources
  // -----------------------------
  const mtproto$ = new Subject<MTUpdate>()

  const totalMessages$ = new BehaviorSubject(0)
  const errorCount$ = new BehaviorSubject(0)

  // -----------------------------
  // Normalize / enrich
  // -----------------------------
  const updates$ = mtproto$.pipe(
    map((update) => createEnvelope(update)),
    tap(() => totalMessages$.next(totalMessages$.value + 1)),
    share()
  )

  // -----------------------------
  // Business logic stage
  // -----------------------------
  const processed$ = updates$.pipe(
    mergeMap((env) => {
      if (env.text.includes('fail')) {
        errorCount$.next(errorCount$.value + 1)
        throw new Error('Simulated failure')
      }
      return of(env)
    }),
    catchError((err, caught) => {
      console.error('Caught error:', err.message)
      return caught // continue the stream
    }),
    tap((env) => console.log('Business logic passed:', env?.text))
  )

  // -----------------------------
  // Compute dynamic error rate
  // -----------------------------
  const errorRate$ = errorCount$.pipe(
    map((errCount) => {
      const total = totalMessages$.value
      return total === 0 ? 0 : errCount / total
    }),
    tap((rate) => console.log('Current error rate:', rate))
  )

  // -----------------------------
  // Adaptive throttling
  // -----------------------------
  const adaptiveThrottle$ = errorRate$.pipe(
    map((rate) => {
      if (rate > 0.2) return 3000
      if (rate > 0.1) return 1000
      return 200
    })
  )

  // -----------------------------
  // Drop messages if error rate too high
  // -----------------------------
  const ERROR_DROP_THRESHOLD = 0.4

  const throttled$ = processed$.pipe(
    // check error rate before throttling
    mergeMap((env) =>
      errorRate$.pipe(
        take(1),
        filter((rate) => {
          const pass = rate <= ERROR_DROP_THRESHOLD
          if (!pass) console.warn(`Dropping message due to high error rate: ${env.text}`)
          return pass
        }),
        map(() => env)
      )
    ),
    // throttle after filtering
    throttle(() =>
      adaptiveThrottle$.pipe(
        take(1),
        switchMap((ms) => timer(ms))
      )
    ),
    tap((env) => console.log('Emitted after throttle:', env.text))
  )

  // -----------------------------
  // Subscribe
  // -----------------------------
  throttled$.subscribe()

  // -----------------------------
  // Test messages
  // -----------------------------
  const messages: MTUpdate[] = [
    { chatId: 1, kind: 'message', text: 'Hello world' },
    { chatId: 1, kind: 'message', text: 'This will fail' },
    { chatId: 1, kind: 'message', text: 'Another good message' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'fail again' },
    { chatId: 1, kind: 'message', text: 'All good' }
  ]

  messages.forEach((msg) => mtproto$.next(msg))
})
