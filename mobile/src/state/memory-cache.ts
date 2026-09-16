type Stamp = { fetchedAt: number };
export type CacheOptions = { now?: () => number; ttl?: number; maxEntries?: number; maxBytes?: number };
type Flight = { valid: boolean; promise?: Promise<unknown> };

/**
 * Account-owned memory cache shared by feature adapters; never persists credentials or data.
 * Values carry their successful-read timestamp so merging a write need not refresh the TTL.
 * Adapters own keys, data shapes, request coverage, and which entries a mutation invalidates.
 */
export function createMemoryCache<T extends Stamp, RequestKey = string>(
  options: CacheOptions & { sizeOf?: (value: T) => number } = {},
) {
  const now = options.now ?? Date.now;
  const ttl = options.ttl ?? 60_000;
  const maxEntries = options.maxEntries ?? 100;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const sizeOf = options.sizeOf ?? ((value: T) => JSON.stringify(value).length * 2);
  const entries = new Map<string, { value: T; bytes: number }>();
  const flights = new Map<RequestKey, Flight>();
  let retainedBytes = 0;

  function remove(key: string) {
    retainedBytes -= entries.get(key)?.bytes ?? 0;
    entries.delete(key);
  }

  /** Reads update LRU order unless the adapter is only inspecting metadata. */
  function get(key: string, touch = true) {
    const entry = entries.get(key);
    if (entry && touch) { entries.delete(key); entries.set(key, entry); }
    return entry?.value;
  }

  /** Reject oversized values without truncating what the caller can display. */
  function set(key: string, value: T) {
    const bytes = sizeOf(value);
    remove(key);
    if (bytes > maxBytes || maxEntries <= 0) return;
    entries.set(key, { value, bytes }); retainedBytes += bytes;
    while (entries.size > maxEntries || retainedBytes > maxBytes) remove(entries.keys().next().value!);
  }

  /** Pick the newest covering entry; predicates stay feature-specific. */
  function find(matches: (value: T, key: string) => boolean) {
    let found: string | undefined;
    let newest = -Infinity;
    for (const [key, { value }] of entries) {
      if (matches(value, key) && (found === undefined || value.fetchedAt > newest)) {
        found = key; newest = value.fetchedAt;
      }
    }
    return found === undefined ? undefined : get(found);
  }

  function markStale(matches: (value: T, key: string) => boolean = () => true) {
    for (const [key, { value }] of entries) if (matches(value, key)) value.fetchedAt = -Infinity;
  }

  /** Detach pending reads without aborting HTTP; adapters check valid() before committing. */
  function fence(matches: (key: RequestKey) => boolean = () => true) {
    for (const [key, ticket] of flights) {
      if (matches(key)) { ticket.valid = false; flights.delete(key); }
    }
  }

  /** Share exact or adapter-defined covering requests; failures are never cached or retried. */
  function shared<R>(key: RequestKey, fetch: (valid: () => boolean) => Promise<R>, covers?: (key: RequestKey) => boolean): Promise<R> {
    const existing = flights.get(key) ?? (covers && [...flights].find(([candidate]) => covers(candidate))?.[1]);
    if (existing?.promise) return existing.promise as Promise<R>;
    const ticket: Flight = { valid: true };
    flights.set(key, ticket);
    ticket.promise = (async () => fetch(() => ticket.valid))().finally(() => {
      if (flights.get(key) === ticket) flights.delete(key);
    });
    return ticket.promise as Promise<R>;
  }

  return {
    now, get, set, find, markStale, fence, shared, delete: remove,
    fresh: (value: Stamp | undefined) => Boolean(value && now() - value.fetchedAt < ttl),
    clear() { fence(); entries.clear(); retainedBytes = 0; },
  };
}
