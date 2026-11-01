import Redis from "ioredis";
import { config } from "../config.js";

const memory = new Map<string, { value: string; expires: number }>();
let redis: Redis | null = null;
let redisFailed = false;

function getRedis(): Redis | null {
  if (redisFailed) return null;
  if (!redis) {
    try {
      redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      redis.on("error", () => {
        redisFailed = true;
      });
    } catch {
      redisFailed = true;
      return null;
    }
  }
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (client && !redisFailed) {
    try {
      await client.connect().catch(() => undefined);
      return await client.get(key);
    } catch {
      redisFailed = true;
    }
  }
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (client && !redisFailed) {
    try {
      await client.set(key, value, "EX", ttlSeconds);
      return;
    } catch {
      redisFailed = true;
    }
  }
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}
