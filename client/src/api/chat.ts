import type { Source } from '../types'
import { apiFetch, responseError } from './client'

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done' }
  | { type: 'error'; message?: string }

type StreamChatHandlers = {
  onText: (delta: string) => void
  onSources?: (sources: Source[]) => void
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
  const response = await apiFetch('/chat/', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ text: question }),
  })

  if (!response.ok) throw await responseError(response, 'Chat request failed')
  if (!response.body) throw await responseError(response, 'Chat stream unavailable')

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
        throw await responseError(response, event.message ?? 'Chat stream failed')
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
