import type { ChatResponse } from '../types/chat'
import { ApiRequestError } from './errors'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export async function submitChat(question: string, accessToken?: string): Promise<ChatResponse> {
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

  return response.json() as Promise<ChatResponse>
}
