import { useEffect, useState } from 'react'

export function useSessionState<T>(userId: string, name: string, initialValue: T) {
  const key = `arcel:session:v1:${userId}:${name}`
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(key) ?? '') as T
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Keep working in memory when browser storage is unavailable.
    }
  }, [key, value])

  return [value, setValue] as const
}
