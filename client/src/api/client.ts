import { ApiRequestError } from './errors'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type ApiOptions = RequestInit & { accessToken?: string }

export function apiFetch(path: string, { accessToken, headers, ...options }: ApiOptions = {}) {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  if (options.body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  return fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers: requestHeaders,
  })
}

function errorDetail(detail: unknown) {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (!Array.isArray(detail)) return null

  const issue = detail.find((item) => item && typeof item === 'object' && 'msg' in item)
  const message = issue && typeof issue.msg === 'string' ? issue.msg.trim() : ''
  return message ? message.replace(/^Value error,\s*/i, '') : null
}

export async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { detail?: unknown }
    return new ApiRequestError(errorDetail(body.detail) ?? fallback, response.status)
  } catch {
    return new ApiRequestError(fallback, response.status)
  }
}

export async function apiJson<T>(path: string, options: ApiOptions, fallback: string): Promise<T> {
  const response = await apiFetch(path, options)
  if (!response.ok) throw await responseError(response, fallback)
  return response.json() as Promise<T>
}
