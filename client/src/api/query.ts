import type { QueryResponse } from '../types/query'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class QueryRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'QueryRequestError'
    this.status = status
  }
}

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
    throw new QueryRequestError('Query request failed', response.status)
  }

  return response.json() as Promise<QueryResponse>
}
