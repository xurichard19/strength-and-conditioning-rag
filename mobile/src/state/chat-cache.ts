import type { Conversation, SavedMessage } from '../services/backend';

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

function hasMore(older: boolean, full: boolean, overlap: boolean, trimmed: boolean, previous = false) {
  if (older) return full;
  if (trimmed) return true;
  return full && (!overlap || previous);
}

/** Merge either kind of history page chronologically, preserving gaps, bounds, and head freshness. */
function pageWindow<T extends { id: string; created_at: string }>(
  previous: Pick<Window<T>, 'rows' | 'more' | 'fetchedAt'> | undefined, incoming: T[],
  older: boolean, pageSize: number, capacity: number, stamp: number,
): Window<T> {
  const previousRows = previous?.rows ?? [];
  const ids = new Set(previousRows.map(row => row.id));
  const overlap = incoming.some(row => ids.has(row.id));
  const full = incoming.length === pageSize;
  // A disconnected or exhausted newest page replaces the old window.
  const combined = merge(older || (full && overlap) ? previousRows : [], incoming).sort(order);
  const trimmed = combined.length > capacity;
  const rows = older ? combined.slice(0, capacity) : combined.slice(-capacity);
  const fetchedAt = older ? previous?.fetchedAt ?? stamp : stamp;
  return { rows, cursor: rows[0], more: hasMore(older, full, overlap, trimmed, previous?.more),
    fetchedAt: older && trimmed ? -Infinity : fetchedAt };
}

/**
 * One account's bounded, memory-only read cache. Replace this storage boundary
 * with SQLite later; screens never read maps or persist credentials themselves.
 * Fresh reads share results (including empty lists); concurrent reads share work.
 */
export function createChatCache(options: { now?: () => number; ttl?: number; maxThreads?: number; maxBytes?: number } = {}) {
  const now = options.now ?? Date.now;
  const ttl = options.ttl ?? 60_000;
  const maxThreads = options.maxThreads ?? 5;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const metadata = new Map<string, Conversation>();
  const metadataAge = new Map<string, number>();
  const windows = new Map<string, MessageWindow>();
  const flights = new Map<string, { valid: boolean; promise?: Promise<unknown> }>();
  let list: Window<string> | undefined;
  const fresh = (stamp: number) => now() - stamp < ttl;

  function reusable(window: { more: boolean; fetchedAt: number } | undefined, older: boolean, force = false) {
    if (!window) return false;
    return older ? !window.more : !force && fresh(window.fetchedAt);
  }

  function invalidate(prefix: string) {
    for (const [key, ticket] of flights) {
      if (key.startsWith(prefix)) { ticket.valid = false; flights.delete(key); }
    }
  }

  function shared<T>(key: string, fetch: (valid: () => boolean) => Promise<T>): Promise<T> {
    const existing = flights.get(key)?.promise;
    if (existing) return existing as Promise<T>;
    const ticket: { valid: boolean; promise?: Promise<unknown> } = { valid: true };
    flights.set(key, ticket);
    const work = fetch(() => ticket.valid).finally(() => { if (flights.get(key) === ticket) flights.delete(key); });
    ticket.promise = work;
    return work;
  }

  // Bound both strings and row counts. This estimates retained content, not total JS/UI RAM.
  function retain(id: string, window: MessageWindow) {
    windows.delete(id);
    const bytes = (rows: SavedMessage[]) => rows.reduce((size, row) => size + row.content.length * 2 + 256, 0);
    if (bytes(window.rows) > maxBytes) return;
    windows.set(id, window);
    while (windows.size > maxThreads || [...windows.values()].reduce((sum, item) => sum + bytes(item.rows), 0) > maxBytes) {
      windows.delete(windows.keys().next().value!);
    }
  }

  function remember(row: Conversation, fetchedAt = now()) {
    metadata.delete(row.id);
    metadata.set(row.id, row);
    metadataAge.set(row.id, fetchedAt);
    while (metadata.size > 500) {
      const id = metadata.keys().next().value!;
      metadata.delete(id); metadataAge.delete(id);
    }
  }

  function peekMessages(id: string) {
    const window = windows.get(id);
    if (window) { windows.delete(id); windows.set(id, window); }
    return window;
  }

  function peekList() {
    return list && { ...list, rows: list.rows.flatMap(id => metadata.get(id) ? [metadata.get(id)!] : []) };
  }

  return {
    peekList, peekMessages,
    peekConversation: (id: string) => metadata.get(id),
    /** Invalidate pending reads too: old sessions and pre-mutation results cannot refill the cache. */
    clear() { invalidate(''); metadata.clear(); metadataAge.clear(); windows.clear(); list = undefined; },
    async loadList(api: Api, older = false) {
      if (reusable(list, older)) return peekList();
      const cursor = older ? list?.cursor : undefined;
      return shared('list:' + (cursor ?? ''), async valid => {
        const rows = await api.getConversations(cursor);
        if (!valid()) return peekList();
        if (!older) invalidate('list:'); // Older reads belong to the previous head/window.
        const window = pageWindow(peekList(), rows, older, 50, 500, now());
        const fetchedIds = new Set(rows.map(row => row.id));
        window.rows.forEach(row => remember(row, fetchedIds.has(row.id) ? now() : metadataAge.get(row.id) ?? -Infinity));
        list = {
          ...window, rows: window.rows.map(row => row.id).reverse(), cursor: window.cursor?.id,
        };
        return peekList();
      });
    },
    /** Metadata is shared by the list and heading; list refreshes update remote renames. */
    async loadConversation(api: Api, id: string) {
      if (metadata.has(id) && fresh(metadataAge.get(id) ?? -Infinity)) return metadata.get(id);
      return shared('conversation:' + id, async valid => {
        const row = await api.getConversation(id);
        if (!valid()) return metadata.get(id);
        remember(row);
        return row;
      });
    },
    async loadMessages(api: Api, id: string, older = false, force = false) {
      const cached = peekMessages(id);
      if (reusable(cached, older, force)) return cached;
      const cursor = older ? cached?.cursor : undefined;
      return shared('messages:' + id + ':' + (cursor?.id ?? ''), async valid => {
        const rows = await api.getMessages(id, cursor);
        if (!valid()) return peekMessages(id);
        if (!older) invalidate('messages:' + id + ':');
        const window = pageWindow(windows.get(id), rows, older, 20, 200, now());
        retain(id, window);
        return window;
      });
    },
    /** Apply confirmed writes without marking unrelated pages fresh. */
    putConversation(row: Conversation) {
      invalidate('list:'); invalidate('conversation:' + row.id); remember(row);
      if (list) {
        const rows = merge(peekList()!.rows, [row]).sort((a, b) => order(b, a));
        list = { ...list, rows: rows.slice(0, 500).map(item => item.id),
          cursor: rows.slice(0, 500).at(-1)?.id, more: list.more || rows.length > 500 };
      }
    },
    putMessages(id: string, rows: SavedMessage[]) {
      invalidate('messages:' + id + ':');
      const old = windows.get(id);
      const all = merge(old?.rows ?? [], rows).sort(order);
      const retained = all.slice(-200);
      retain(id, { rows: retained, cursor: retained[0], more: all.length > 200 || (old?.more ?? true),
        fetchedAt: old?.fetchedAt ?? -Infinity });
    },
    /** Fence earlier reads while preserving page freshness; local writes do not refresh the TTL. */
    beginTurn(id: string, isNew: boolean) {
      invalidate('messages:' + id + ':');
      if (isNew) retain(id, { rows: [], more: false, fetchedAt: now() });
    },
    invalidateMessages(id: string) {
      invalidate('messages:' + id + ':');
      const old = windows.get(id);
      if (old) old.fetchedAt = -Infinity;
    },
    removeConversation(id: string) {
      invalidate('list:'); invalidate('conversation:' + id); invalidate('messages:' + id + ':');
      metadata.delete(id); metadataAge.delete(id); windows.delete(id);
      if (list) list = { ...list, rows: list.rows.filter(item => item !== id),
        cursor: list.rows.filter(item => item !== id).at(-1), fetchedAt: -Infinity };
    },
  };
}
