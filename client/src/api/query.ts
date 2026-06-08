import type { QueryResponse } from '../types/query'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function apiPath(path: string) {
  const baseUrl = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export async function submitQuery(question: string, accessToken?: string): Promise<QueryResponse> {
  const response = await fetch(apiPath('/query/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ text: question }),
  })

  if (!response.ok) {
    throw new Error('Query request failed')
  }

  return response.json() as Promise<QueryResponse>
}
