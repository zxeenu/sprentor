import { test } from 'bun:test'
import { map, share, Subject, tap } from 'rxjs'
import { createEnvelope } from '../lib/envelope'

test('testing rx', async () => {
  type MTUpdate = { kind: 'message'; chatId: number; text: string } | { kind: 'edit'; chatId: number } | { kind: 'typing'; chatId: number }

  // raw events
  const mtproto$ = new Subject<MTUpdate>()

  // first cleanup
  const updates$ = mtproto$
    .pipe(
      map((rawEvent) => {
        const envelope = createEnvelope(rawEvent)
        return envelope
      }),
      share() // VERY important: single upstream subscription.  without share, each subscription will gem them the entir stream, 0 to n
    )
    .pipe(tap(console.log))

  // ends the terminus state
  updates$.subscribe()

  mtproto$.next({
    'chatId': 2,
    'kind': 'message',
    'text': '.test howdy bro'
  })
  mtproto$.next({
    'chatId': 2,
    'kind': 'message',
    'text': 'howdy bro'
  })
})
