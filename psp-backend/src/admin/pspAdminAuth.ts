import crypto from "crypto";
import { AppError } from "../core/errors";
import type { Request } from "express";
import { parseCookiesFromRequest } from "../core/sessionCookies";

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const PSP_ADMIN_COOKIE_NAME = "psp_admin_session";

type PspAdminTokenPayload = {
  userId: string;
  email: string;
  role: string;
  exp: number;
};

function getAdminSecret() {
  return process.env.PSP_ADMIN_SECRET || "dev-psp-admin-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function hashAdminPassword(password: string) {
  const normalized = String(password || "");
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(normalized, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyAdminPassword(password: string, passwordHash: string) {
  const [salt, expectedHex] = String(passwordHash || "").split(":");

  if (!salt || !expectedHex) {
    return false;
  }

  const actual = crypto.scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(expectedHex, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

export function createPspAdminToken(userId: string, email: string, role: string) {
  const payload: PspAdminTokenPayload = {
    userId,
    email,
    role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getAdminSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyPspAdminToken(token: string): PspAdminTokenPayload {
  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    throw AppError.invalidAdminToken();
  }

  const expectedSignature = crypto
    .createHmac("sha256", getAdminSecret())
    .update(encodedPayload)
    .digest("base64url");

  if (expectedSignature !== signature) {
    throw AppError.invalidAdminToken();
  }

  let payload: PspAdminTokenPayload;

  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    throw AppError.invalidAdminToken();
  }

  if (
    !payload.userId ||
    !payload.email ||
    !payload.role ||
    !payload.exp ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw AppError.invalidAdminToken();
  }

  return payload;
}

export function extractAdminBearerToken(authorizationHeader?: string) {
  const raw = String(authorizationHeader || "").trim();

  if (!raw.toLowerCase().startsWith("bearer ")) {
    throw AppError.invalidAdminToken();
  }

  const token = raw.slice(7).trim();

  if (!token) {
    throw AppError.invalidAdminToken();
  }

  return token;
}

export function extractPspAdminTokenFromRequest(req: Request) {
  const authorizationHeader = req.header("authorization");

  if (authorizationHeader?.trim()) {
    return extractAdminBearerToken(authorizationHeader);
  }

  const cookies = parseCookiesFromRequest(req);
  const token = cookies[PSP_ADMIN_COOKIE_NAME];

  if (!token) {
    throw AppError.invalidAdminToken();
  }

  return token;
}

export function normalizeAdminEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function validateAdminPassword(password: string) {
  const normalized = String(password || "");

  if (normalized.length < 8) {
    throw AppError.validationInvalidField(
      "body",
      "password",
      "Пароль администратора должен быть не короче 8 символов",
      "********",
    );
  }
}
