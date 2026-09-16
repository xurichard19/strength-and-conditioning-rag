import { calendarSnapshot, type CalendarSnapshot } from '../lib/calendar';
import type { CalendarResponse } from '../services/backend';
import { createMemoryCache } from './memory-cache';

type Range = { start: string; end: string };
type Entry = Range & { data: CalendarSnapshot; fetchedAt: number };
type Api = { getCalendarRange: (start: string, end: string) => Promise<CalendarResponse> };
const overlaps = (a: Range, b: Range) => a.start <= b.end && b.start <= a.end;
const covers = (a: Range, b: Range) => a.start <= b.start && a.end >= b.end;
const within = (data: CalendarSnapshot, range: Range): CalendarSnapshot => ({ ...data,
  entries: data.entries.filter(row => row.date >= range.start && row.date <= range.end) });

/** One account's summary cache; TTL controls reuse, LRU/content limits bound retained memory. */
export function createCalendarCache(options: { now?: () => number; ttl?: number; maxRanges?: number; maxBytes?: number } = {}) {
  const cache = createMemoryCache<Entry, Range>({ ...options,
    maxEntries: options.maxRanges ?? 6, maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
    sizeOf: entry => JSON.stringify(entry.data).length * 2 });
  const listeners = new Set<(range: Range) => void>();

  function peek(start: string, end: string) {
    const range = { start, end };
    const row = cache.find(entry => covers(entry, range));
    return row && { data: within(row.data, range), fresh: cache.fresh(row) };
  }

  /** Mark overlapping ranges stale and fence off pre-write responses; omit dates to invalidate all. */
  function invalidate(start = '0000-01-01', end = '9999-12-31', notify = true) {
    const range = { start, end };
    cache.markStale(row => overlaps(row, range));
    cache.fence(pending => overlaps(pending, range));
    if (notify) listeners.forEach(listener => listener(range));
  }

  return {
    peek, invalidate,
    subscribe(listener: (range: Range) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear: cache.clear,
    /** Fresh containing months satisfy week reads; concurrent containing reads share one request. */
    async load(api: Api, start: string, end: string, force = false): Promise<CalendarSnapshot | undefined> {
      if (force) invalidate(start, end, false);
      const cached = peek(start, end);
      if (cached?.fresh) return cached.data;
      const range = { start, end };
      const data = await cache.shared(range, async valid => {
        const response = await api.getCalendarRange(start, end);
        if (!valid()) return;
        const result = within(calendarSnapshot(response), range);
        cache.markStale(row => overlaps(row, range));
        cache.set(`${start}:${end}`, { ...range, data: result, fetchedAt: cache.now() });
        return result;
      }, pending => covers(pending, range));
      return data && within(data, range);
    },
  };
}

export type CalendarCache = ReturnType<typeof createCalendarCache>;
