import type { ChatResponse } from '../types/chat'
import { ApiRequestError } from './errors'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sources'; sources: NonNullable<ChatResponse['sources']> }
  | { type: 'done' }
  | { type: 'error'; message?: string }

type StreamChatHandlers = {
  onText: (delta: string) => void
  onSources?: (sources: NonNullable<ChatResponse['sources']>) => void
}

function parseChatStreamEvent(line: string): ChatStreamEvent | null {
  try {
    const event = JSON.parse(line) as ChatStreamEvent

    if (!event || typeof event !== 'object' || !('type' in event)) {
      return null
    }

    return event
  } catch {
    return null
  }
}

export async function submitChat(
  question: string,
  accessToken: string | undefined,
  handlers: StreamChatHandlers,
): Promise<void> {
  const response = await fetch(apiPath('/chat/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ text: question }),
  })

  if (!response.ok) {
    throw new ApiRequestError('Chat request failed', response.status)
  }

  if (!response.body) {
    throw new ApiRequestError('Chat stream unavailable', response.status)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      const event = parseChatStreamEvent(trimmedLine)
      if (!event) continue

      if (event.type === 'text') {
        handlers.onText(event.delta)
      } else if (event.type === 'sources') {
        handlers.onSources?.(event.sources)
      } else if (event.type === 'error') {
        throw new ApiRequestError(event.message ?? 'Chat stream failed', response.status)
      }
    }
  }

  buffer += decoder.decode()
  const finalEvent = parseChatStreamEvent(buffer.trim())
  if (finalEvent?.type === 'text') {
    handlers.onText(finalEvent.delta)
  } else if (finalEvent?.type === 'sources') {
    handlers.onSources?.(finalEvent.sources)
  }
}
