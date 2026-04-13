import { randomBytes } from "crypto";

export function normalizeMerchantOrderId(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function generateMerchantOrderId(prefix = "ord") {
  const safePrefix = String(prefix || "ord")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "") || "ord";

  return `${safePrefix}_${Date.now()}_${randomBytes(3).toString("hex")}`;
}

