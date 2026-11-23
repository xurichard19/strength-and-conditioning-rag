const cooldownMs = 6 * 60 * 60 * 1000;

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function createActivityReporter(storage: Storage, send: (userId: string) => Promise<void>, now = Date.now) {
  const pending = new Set<string>();
  return async (userId: string) => {
    if (pending.has(userId)) return;
    pending.add(userId);
    try {
      const key = `arcel:last-activity-report:${userId}`;
      const saved = await storage.getItem(key).catch(() => null);
      const elapsed = now() - Number(saved);
      if (saved && elapsed >= 0 && elapsed < cooldownMs) return;
      await send(userId);
      await storage.setItem(key, String(now()));
    } finally {
      pending.delete(userId);
    }
  };
}
