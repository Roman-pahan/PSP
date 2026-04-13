import type { Request, Response } from "express";

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

function useSecureCookies() {
  return process.env.NODE_ENV === "production";
}

function serializeCookie(
  name: string,
  value: string,
  options?: {
    maxAgeMs?: number;
    expires?: Date;
  },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (useSecureCookies()) {
    parts.push("Secure");
  }

  if (options?.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeMs / 1000)}`);
  }

  if (options?.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

export function parseCookiesFromRequest(req: Request) {
  const raw = String(req.headers.cookie || "");
  const cookies: Record<string, string> = {};

  for (const part of raw.split(";")) {
    const normalized = part.trim();

    if (!normalized) {
      continue;
    }

    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

export function setSessionCookie(
  res: Response,
  cookieName: string,
  token: string,
) {
  res.append(
    "Set-Cookie",
    serializeCookie(cookieName, token, { maxAgeMs: SESSION_MAX_AGE_MS }),
  );
}

export function clearSessionCookie(res: Response, cookieName: string) {
  res.append(
    "Set-Cookie",
    serializeCookie(cookieName, "", {
      maxAgeMs: 0,
      expires: new Date(0),
    }),
  );
}
