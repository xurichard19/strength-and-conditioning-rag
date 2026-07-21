type QueryCacheEntry = {
  expiresAt: number
  value: Promise<unknown>
}

const queryCache = new Map<string, QueryCacheEntry>()

export async function getCachedQuery<T>(
  key: string,
  query: () => Promise<T>,
  staleTimeMs: number,
): Promise<T> {
  const cached = queryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value as Promise<T>

  const value = query()
    .catch((error: unknown) => {
      if (queryCache.get(key)?.value === value) queryCache.delete(key)
      throw error
    })
  queryCache.set(key, { expiresAt: Date.now() + staleTimeMs, value })
  return value
}

export function invalidateCachedQueries(keyPrefix: string) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      queryCache.delete(key)
    }
  }
}
