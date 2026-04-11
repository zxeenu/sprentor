import type { Message } from '@mtcute/bun'
import { createHash } from 'crypto'

export function extractVideoID(url: string) {
  const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  const match = url.match(regex)
  return match ? match[1] : null
}

export function hashString(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

export function getTelegramMsgPolicyData(msg: Message) {
  const chatId = msg.chat.id
  const userName = msg.sender.username
  const userId = msg.sender.id

  if (!userName) {
    return null
  }

  return {
    userName,
    chatId,
    userId
  }
}
