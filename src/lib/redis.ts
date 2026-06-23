/**
 * Redis cache client for sessions and API response caching.
 * Best practice: TTL, graceful fallback when Redis unavailable.
 */
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (redis) return redis;
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 3000)),
      lazyConnect: true,
    });
    return redis;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function cacheDel(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.del(key);
    return true;
  } catch {
    return false;
  }
}

export function cacheKey(prefix: string, ...parts: string[]): string {
  return `hwo:${prefix}:${parts.join(":")}`;
}
