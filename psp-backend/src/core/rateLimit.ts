import type { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { AppError } from "./errors";
import { sendError } from "./httpError";

type BucketState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, BucketState>();
let redisClientPromise: Promise<any | null> | null = null;
let redisWarningShown = false;
let lastRateLimitBackend: "memory" | "redis" = "memory";
let redisFallbackActive = false;

type RateLimitOptions = {
  key: string;
  windowMs: number;
  maxRequests: number;
  onLimit?: (req: Request, retryAfterSeconds: number) => Promise<void> | void;
};

function getClientIdentifier(req: Request) {
  const forwardedFor = String(req.header("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim();

  return (
    forwardedFor ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown-client"
  );
}

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    lastRateLimitBackend = "memory";
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const client = createClient({
          url: process.env.REDIS_URL,
        });

        client.on("error", (err) => {
          redisFallbackActive = true;
          lastRateLimitBackend = "memory";
          if (!redisWarningShown) {
            console.error("Redis rate limit client error, fallback to memory:", err);
            redisWarningShown = true;
          }
        });

        await client.connect();
        redisFallbackActive = false;
        lastRateLimitBackend = "redis";
        return client;
      } catch (err) {
        redisFallbackActive = true;
        lastRateLimitBackend = "memory";
        if (!redisWarningShown) {
          console.error("Не удалось подключить Redis для rate limit, fallback to memory:", err);
          redisWarningShown = true;
        }

        return null;
      }
    })();
  }

  return redisClientPromise;
}

async function incrementRedisBucket(
  bucketKey: string,
  windowMs: number,
) {
  const client = await getRedisClient();

  if (!client) {
    return null;
  }

  try {
    const result = (await client.eval(
      `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('PTTL', KEYS[1])
        return {current, ttl}
      `,
      {
        keys: [bucketKey],
        arguments: [String(windowMs)],
      },
    )) as [number, number];

    return {
      count: Number(result[0] || 0),
      retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1] || 0) / 1000)),
      backend: "redis" as const,
    };
  } catch (err) {
    redisFallbackActive = true;
    lastRateLimitBackend = "memory";
    if (!redisWarningShown) {
      console.error("Redis rate limit eval failed, fallback to memory:", err);
      redisWarningShown = true;
    }

    return null;
  }
}

function incrementMemoryBucket(bucketKey: string, windowMs: number) {
  lastRateLimitBackend = "memory";
  const now = Date.now();
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(bucketKey, {
      count: 1,
      resetAt,
    });

    return {
      count: 1,
      retryAfterSeconds: Math.ceil((resetAt - now) / 1000),
      backend: "memory" as const,
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);

  return {
    count: current.count,
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    backend: "memory" as const,
  };
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const clientId = getClientIdentifier(req);
    const bucketKey = `${options.key}:${clientId}`;
    const redisState = await incrementRedisBucket(bucketKey, options.windowMs);
    const state = redisState || incrementMemoryBucket(bucketKey, options.windowMs);

    if (state.count > options.maxRequests) {
      const retryAfterSeconds = state.retryAfterSeconds;

      if (options.onLimit) {
        try {
          await options.onLimit(req, retryAfterSeconds);
        } catch (err) {
          console.error("Не удалось записать audit log для rate limit:", err);
        }
      }

      return sendError(
        res,
        AppError.tooManyRequests(options.key, retryAfterSeconds),
      );
    }
    return next();
  };
}

export function resetRateLimitBuckets() {
  buckets.clear();
  lastRateLimitBackend = "memory";
  redisFallbackActive = false;
}

export async function disconnectRateLimitRedis() {
  if (!redisClientPromise) {
    return;
  }

  const client = await redisClientPromise;

  if (client?.isOpen) {
    await client.quit();
  }

  redisClientPromise = null;
}

export function getRateLimitDiagnostics() {
  return {
    configuredBackend: process.env.REDIS_URL ? "redis" : "memory",
    activeBackend: lastRateLimitBackend,
    redisConfigured: Boolean(process.env.REDIS_URL),
    redisFallbackActive,
    memoryBucketCount: buckets.size,
  };
}
