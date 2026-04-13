import crypto from "crypto";
import { AppError } from "../core/errors";
import type { Request } from "express";
import { parseCookiesFromRequest } from "../core/sessionCookies";

const TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const MERCHANT_PORTAL_COOKIE_NAME = "merchant_portal_session";

type MerchantPortalTokenPayload = {
  merchantId: string;
  email: string;
  userId?: string | null;
  role?: string | null;
  exp: number;
};

function getPortalSecret() {
  return process.env.MERCHANT_PORTAL_SECRET || "dev-merchant-portal-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function hashPortalPassword(password: string) {
  const normalized = String(password || "");
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(normalized, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPortalPassword(password: string, passwordHash: string) {
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

export function createMerchantPortalToken(params: {
  merchantId: string;
  email: string;
  userId?: string | null;
  role?: string | null;
}) {
  const payload: MerchantPortalTokenPayload = {
    merchantId: params.merchantId,
    email: params.email,
    userId: params.userId || null,
    role: params.role || "owner",
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getPortalSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyMerchantPortalToken(
  token: string,
): MerchantPortalTokenPayload {
  const [encodedPayload, signature] = String(token || "").split(".");

  if (!encodedPayload || !signature) {
    throw AppError.invalidPortalToken();
  }

  const expectedSignature = crypto
    .createHmac("sha256", getPortalSecret())
    .update(encodedPayload)
    .digest("base64url");

  if (expectedSignature !== signature) {
    throw AppError.invalidPortalToken();
  }

  let payload: MerchantPortalTokenPayload;

  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    throw AppError.invalidPortalToken();
  }

  if (
    !payload.merchantId ||
    !payload.email ||
    !payload.exp ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw AppError.invalidPortalToken();
  }

  return payload;
}

export function extractBearerToken(authorizationHeader?: string) {
  const raw = String(authorizationHeader || "").trim();

  if (!raw.toLowerCase().startsWith("bearer ")) {
    throw AppError.invalidPortalToken();
  }

  const token = raw.slice(7).trim();

  if (!token) {
    throw AppError.invalidPortalToken();
  }

  return token;
}

export function extractMerchantPortalTokenFromRequest(req: Request) {
  const authorizationHeader = req.header("authorization");

  if (authorizationHeader?.trim()) {
    return extractBearerToken(authorizationHeader);
  }

  const cookies = parseCookiesFromRequest(req);
  const token = cookies[MERCHANT_PORTAL_COOKIE_NAME];

  if (!token) {
    throw AppError.invalidPortalToken();
  }

  return token;
}

export function normalizeMerchantEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function validateMerchantPassword(password: string) {
  const normalized = String(password || "");

  if (normalized.length < 8) {
    throw AppError.validationInvalidField(
      "body",
      "password",
      "Пароль должен быть не короче 8 символов",
      "********",
    );
  }
}
