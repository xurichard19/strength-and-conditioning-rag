import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, deferred } from './helpers.ts';

// Exercise the shared core without React, a server, or credentials.
const { createMemoryCache } = load<typeof import('../src/state/memory-cache')>('state/memory-cache.ts');
const row = <T>(value: T, fetchedAt = 0) => ({ value, fetchedAt });
type Value<T = string> = { value: T; fetchedAt: number };
type RangeValue = Value & { start: number; end: number };

test('shared core TTL expires at the boundary without purging stale or empty data', () => {
  let clock = 0;
  const cache = createMemoryCache<Value<string | unknown[]>>({ now: () => clock, ttl: 60 });
  cache.set('empty', row([]));
  clock = 59; assert.equal(cache.fresh(cache.get('empty')), true);
  clock = 60; assert.equal(cache.fresh(cache.get('empty')), false);
  assert.equal(cache.get('empty')?.value.length, 0);
  assert.equal(cache.fresh(undefined), false);
  cache.set('next', row('fresh', clock));
  cache.markStale((_value, key) => key === 'empty');
  assert.equal(cache.get('empty')?.fetchedAt, -Infinity);
  assert.equal(cache.fresh(cache.get('next')), true);
});

test('shared core enforces count LRU and byte budgets across overwrite, delete and clear', () => {
  const cache = createMemoryCache<Value>({ maxEntries: 2, maxBytes: 8, sizeOf: item => item.value.length });
  cache.set('a', row('aaa')); cache.set('b', row('bbb'));
  cache.get('a'); cache.get('b', false); cache.set('c', row('cc'));
  assert.equal(cache.get('b'), undefined); // Inspection does not change eviction order.
  cache.set('a', row('aaaaaaa'));
  assert.equal(cache.get('c'), undefined); // 7 + 2 bytes exceeds the budget.
  cache.set('a', row('x'.repeat(9)));
  assert.equal(cache.get('a'), undefined); // Oversized replacement cannot leave old data looking current.
  cache.set('b', row('12345678')); cache.delete('b'); cache.set('c', row('12345678'));
  assert.ok(cache.get('c'));
  cache.clear(); cache.set('d', row('12345678')); assert.ok(cache.get('d'));
});

test('shared core covering lookup chooses the newest match and permits stale fallback', () => {
  const cache = createMemoryCache<RangeValue>();
  cache.set('old', { ...row('old', 1), start: 1, end: 31 });
  cache.set('new', { ...row('new', 2), start: 7, end: 14 });
  const covers = (item: RangeValue) => item.start <= 8 && item.end >= 10;
  assert.equal(cache.find(covers)?.value, 'new');
  cache.markStale((_value, key) => key === 'new');
  assert.equal(cache.find(covers)?.value, 'old');
  cache.markStale(); assert.ok(cache.find(covers));
  assert.equal(cache.find(item => item.end > 100), undefined);
});

test('shared core deduplicates exact and covering in-flight requests without duplicating work', async () => {
  const cache = createMemoryCache<Value>(); const pending = deferred<string>(); let calls = 0;
  const work = () => { calls++; return pending.promise; };
  const first = cache.shared('month', work);
  const duplicate = cache.shared('month', work);
  const covered = cache.shared('week', work, key => key === 'month');
  assert.equal(first, duplicate); assert.equal(first, covered); assert.equal(calls, 1);
  pending.resolve('done'); assert.equal(await covered, 'done');
  assert.equal(await cache.shared('month', async () => 'new'), 'new');
});

test('shared core fencing blocks stale commits and old completion cannot remove a replacement request', async () => {
  const cache = createMemoryCache<Value>(); const old = deferred<string>(); const next = deferred<string>();
  const first = cache.shared('a', async valid => {
    const value = await old.promise;
    if (valid()) cache.set('a', row(value));
    return valid();
  });
  const other = cache.shared('b', async valid => { await old.promise; return valid(); });
  cache.fence(key => key === 'a');
  const replacement = cache.shared('a', () => next.promise);
  old.resolve('old');
  assert.equal(await first, false); assert.equal(await other, true); assert.equal(cache.get('a'), undefined);
  assert.equal(cache.shared('a', async () => 'duplicate'), replacement);
  next.resolve('new'); assert.equal(await replacement, 'new');
});

test('shared core clear fences pending account reads and instances never share values', async () => {
  const a = createMemoryCache<Value>(); const b = createMemoryCache<Value>(); const pending = deferred();
  a.set('same', row('account a')); b.set('same', row('account b'));
  const read = a.shared('same', async valid => {
    await pending.promise;
    if (valid()) a.set('same', row('late account a'));
  });
  a.clear(); pending.resolve(); await read;
  assert.equal(a.get('same'), undefined); assert.equal(b.get('same')?.value, 'account b');
});

test('shared core releases failed requests, handles synchronous throws and does not auto-retry', async () => {
  const cache = createMemoryCache<Value>(); let calls = 0;
  cache.set('a', row('last good'));
  await assert.rejects(cache.shared('a', () => { calls++; throw new Error('sync failure'); }), /sync failure/);
  await assert.rejects(cache.shared('a', async () => { calls++; throw new Error('async failure'); }), /async failure/);
  assert.equal(calls, 2); assert.equal(cache.get('a')?.value, 'last good');
  assert.equal(await cache.shared('a', async () => 'recovered'), 'recovered');
});
