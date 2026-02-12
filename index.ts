import { TelegramClient } from '@mtcute/bun'
import { Dispatcher } from '@mtcute/dispatcher'
import { createEnvelope } from './lib/envelope'
import { eventBus$ } from './src/app'

// -----------------------------
// Telegram client
// -----------------------------
const tg = new TelegramClient({
  apiId: process.env.TELEGRAM_API_ID! as any,
  apiHash: process.env.TELEGRAM_API_HASH! as any
})
const dp = Dispatcher.for(tg)

// -----------------------------
// Telegram command to function handlers
// -----------------------------
const COMMAND_HANDLERS = {
  '.dl': 'v1.download_stream_video'
} as const

// -----------------------------
// Hook into Telegram messages
// -----------------------------
dp.onNewMessage((msg) => {
  try {
    const env = createEnvelope()
    env.messageText = msg.text
    env.username = msg.sender.username ?? ''

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
