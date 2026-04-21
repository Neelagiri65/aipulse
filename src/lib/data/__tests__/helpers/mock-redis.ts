/**
 * mock-redis — tiny in-memory Redis shim for the subscriber / consent /
 * rate-limit tests. Matches only the method shapes we actually use;
 * don't reach for this from production code.
 */

type ExpireEntry = { value: unknown; expiresAt?: number };

export class MockRedis {
  private store = new Map<string, ExpireEntry>();
  private sets = new Map<string, Set<string>>();
  private lists = new Map<string, string[]>();
  private clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  private expired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.clock()) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<unknown> {
    if (this.expired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number },
  ): Promise<"OK"> {
    const expiresAt = opts?.ex !== undefined ? this.clock() + opts.ex * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed++;
      if (this.sets.delete(key)) removed++;
      if (this.lists.delete(key)) removed++;
    }
    return removed;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    this.sets.set(key, set);
    return added;
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    for (const v of values) list.unshift(v);
    this.lists.set(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(start, end);
  }

  async incr(key: string): Promise<number> {
    if (this.expired(key)) this.store.delete(key);
    const current = this.store.get(key);
    const n = typeof current?.value === "number" ? current.value : 0;
    const next = n + 1;
    this.store.set(key, { value: next, expiresAt: current?.expiresAt });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = this.clock() + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === undefined) return -1;
    const remaining = Math.floor((entry.expiresAt - this.clock()) / 1000);
    return Math.max(0, remaining);
  }
}
