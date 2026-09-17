import type { Conversation, SavedMessage } from '../services/backend';
import { createMemoryCache } from './memory-cache';

type Api = {
  getConversations: (before?: string) => Promise<Conversation[]>;
  getConversation: (id: string) => Promise<Conversation>;
  getMessages: (id: string, before?: SavedMessage) => Promise<SavedMessage[]>;
};
type Window<T> = { rows: T[]; cursor?: T; more: boolean; fetchedAt: number };
type MessageWindow = Window<SavedMessage>;
const subMillis = (stamp: string) => Number((stamp.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
const order = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || subMillis(a.created_at) - subMillis(b.created_at) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const merge = <T extends { id: string }>(previous: T[], incoming: T[]) =>
  [...new Map([...previous, ...incoming].map(row => [row.id, row])).values()];

/** Prepend older rows without making the newest page look freshly fetched. */
function olderWindow<T extends { id: string; created_at: string }>(
  previous: Pick<Window<T>, 'rows' | 'more' | 'fetchedAt'> | undefined, incoming: T[],
  pageSize: number, capacity: number, stamp: number,
): Window<T> {
  const combined = merge(previous?.rows ?? [], incoming).sort(order);
  const rows = combined.slice(0, capacity);
  // Evicting the newest rows makes the head stale, even if the older page is fresh.
  return { rows, cursor: rows[0], more: incoming.length === pageSize,
    fetchedAt: combined.length > capacity ? -Infinity : previous?.fetchedAt ?? stamp };
}

/** Refresh the newest page, preserving loaded history only while the pages overlap. */
function pageWindow<T extends { id: string; created_at: string }>(
  previous: Pick<Window<T>, 'rows' | 'more' | 'fetchedAt'> | undefined, incoming: T[],
  older: boolean, pageSize: number, capacity: number, stamp: number,
): Window<T> {
  if (older) return olderWindow(previous, incoming, pageSize, capacity, stamp);
  const previousRows = previous?.rows ?? [];
  const full = incoming.length === pageSize;
  const ids = new Set(previousRows.map(row => row.id));
  const overlap = incoming.some(row => ids.has(row.id));
  // A disconnected or exhausted newest page replaces the old window.
  const combined = merge(full && overlap ? previousRows : [], incoming).sort(order);
  const rows = combined.slice(-capacity);
  return { rows, cursor: rows[0], more: combined.length > capacity || (full && (!overlap || Boolean(previous?.more))),
    fetchedAt: stamp };
}

/**
 * One account's bounded, memory-only read cache. Replace this storage boundary
 * with SQLite later; screens never read maps or persist credentials themselves.
 * Fresh reads share results (including empty lists); concurrent reads share work.
 */
export function createChatCache(options: { now?: () => number; ttl?: number; maxThreads?: number; maxBytes?: number } = {}) {
  const clock = { now: options.now, ttl: options.ttl };
  const metadata = createMemoryCache<{ row: Conversation; fetchedAt: number }>({ ...clock, maxEntries: 500 });
  const lists = createMemoryCache<Window<string>>({ ...clock, maxEntries: 1 });
  const windows = createMemoryCache<MessageWindow>({ ...clock, maxEntries: options.maxThreads ?? 5,
    maxBytes: options.maxBytes ?? 5 * 1024 * 1024,
    // Estimate retained content, not total JS/UI RAM; each window is also capped at 200 rows.
    sizeOf: window => window.rows.reduce((size, row) => size + row.content.length * 2 + 256, 0) });
  const now = windows.now;

  function reusable(window: { more: boolean; fetchedAt: number } | undefined, older: boolean, force = false) {
    if (!window) return false;
    return older ? !window.more : !force && windows.fresh(window);
  }

  function fenceMessages(id: string) {
    windows.fence(key => key.startsWith(id + ':'));
  }

  function remember(row: Conversation, fetchedAt = now()) {
    metadata.set(row.id, { row, fetchedAt });
  }

  const peekMessages = (id: string) => windows.get(id);
  const peekConversation = (id: string) => metadata.get(id, false)?.row;
  function peekList() {
    const list = lists.get('list');
    return list && { ...list, rows: list.rows.flatMap(id => {
      const row = peekConversation(id); return row ? [row] : [];
    }) };
  }

  return {
    peekList, peekMessages, peekConversation,
    /** Invalidate pending reads too: old sessions and pre-mutation results cannot refill the cache. */
    clear() { metadata.clear(); windows.clear(); lists.clear(); },
    async loadList(api: Api, older = false, force = false) {
      const list = lists.get('list');
      if (force && !older) lists.markStale();
      if (reusable(list, older, force)) return peekList();
      const cursor = older ? list?.cursor : undefined;
      return lists.shared(cursor ?? '', async valid => {
        const rows = await api.getConversations(cursor);
        if (!valid()) return peekList();
        if (!older) lists.fence(); // Older reads belong to the previous head/window.
        const window = pageWindow(peekList(), rows, older, 50, 500, now());
        const fetchedIds = new Set(rows.map(row => row.id));
        window.rows.forEach(row => remember(row, fetchedIds.has(row.id) ? now() : metadata.get(row.id, false)?.fetchedAt ?? -Infinity));
        lists.set('list', {
          ...window, rows: window.rows.map(row => row.id).reverse(), cursor: window.cursor?.id,
        });
        return peekList();
      });
    },
    /** Metadata is shared by the list and heading; list refreshes update remote renames. */
    async loadConversation(api: Api, id: string) {
      const entry = metadata.get(id, false);
      if (metadata.fresh(entry)) return entry!.row;
      return metadata.shared(id, async valid => {
        const row = await api.getConversation(id);
        if (!valid()) return peekConversation(id);
        remember(row);
        return row;
      });
    },
    async loadMessages(api: Api, id: string, older = false, force = false) {
      const cached = peekMessages(id);
      if (reusable(cached, older, force)) return cached;
      const cursor = older ? cached?.cursor : undefined;
      return windows.shared(id + ':' + (cursor?.id ?? ''), async valid => {
        const rows = await api.getMessages(id, cursor);
        if (!valid()) return peekMessages(id);
        if (!older) fenceMessages(id);
        const window = pageWindow(windows.get(id), rows, older, 20, 200, now());
        windows.set(id, window);
        return window;
      });
    },
    /** Apply confirmed writes without marking unrelated pages fresh. */
    putConversation(row: Conversation) {
      lists.fence(); metadata.fence(id => id === row.id); remember(row);
      const list = lists.get('list');
      if (list) {
        const rows = merge(peekList()!.rows, [row]).sort((a, b) => order(b, a));
        const retained = rows.slice(0, 500).map(item => item.id);
        lists.set('list', { ...list, rows: retained,
          cursor: retained.at(-1), more: list.more || rows.length > 500 });
      }
    },
    putMessages(id: string, rows: SavedMessage[]) {
      fenceMessages(id);
      const old = windows.get(id);
      const all = merge(old?.rows ?? [], rows).sort(order);
      const retained = all.slice(-200);
      windows.set(id, { rows: retained, cursor: retained[0], more: all.length > 200 || (old?.more ?? true),
        fetchedAt: old?.fetchedAt ?? -Infinity });
    },
    /** Fence earlier reads while preserving page freshness; local writes do not refresh the TTL. */
    beginTurn(id: string, isNew: boolean) {
      fenceMessages(id);
      if (isNew) windows.set(id, { rows: [], more: false, fetchedAt: now() });
    },
    invalidateMessages(id: string) {
      fenceMessages(id);
      windows.markStale((_value, key) => key === id);
    },
    removeConversation(id: string) {
      lists.fence(); metadata.fence(key => key === id); fenceMessages(id);
      metadata.delete(id); windows.delete(id);
      const list = lists.get('list');
      if (list) {
        const rows = list.rows.filter(item => item !== id);
        lists.set('list', { ...list, rows, cursor: rows.at(-1), fetchedAt: -Infinity });
      }
    },
  };
}
