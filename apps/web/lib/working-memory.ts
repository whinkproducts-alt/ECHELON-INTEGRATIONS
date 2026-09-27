// In-memory working memory with TTL (Redis not available in this environment)
// Falls back gracefully — data is ephemeral per server instance

interface MemoryEntry {
  value: any;
  expiresAt: number;
}

const store = new Map<string, MemoryEntry>();

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(key);
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, 5 * 60 * 1000);
}

export const workingMemory = {
  async get(key: string): Promise<any> {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key: string, value: any, ttlMs: number = DEFAULT_TTL): Promise<void> {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  },

  async delete(key: string): Promise<void> {
    store.delete(key);
  },

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return Array.from(store.keys()).filter((k: string) => regex.test(k));
  },
};
