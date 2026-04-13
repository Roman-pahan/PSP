import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const TOTP_ISSUER = "PSP Admin";

function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value: string) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index < 0) {
      continue;
    }

    accumulator = (accumulator << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = crypto
    .createHmac("sha1", secret)
    .update(counterBuffer)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function generateTotpProvisioningUri(email: string, secret: string) {
  const accountName = String(email || "").trim().toLowerCase();
  const label = `${TOTP_ISSUER}:${accountName}`;

  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(
    secret,
  )}&issuer=${encodeURIComponent(TOTP_ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

export function generateTotpCode(secret: string, timestampMs = Date.now()) {
  const secretBuffer = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(secretBuffer, counter);
}

export function verifyTotpCode(
  secret: string,
  code: string,
  timestampMs = Date.now(),
) {
  const normalizedCode = String(code || "").replace(/\D/g, "");

  if (normalizedCode.length !== TOTP_DIGITS) {
    return false;
  }

  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const candidate = generateTotpCode(
      secret,
      timestampMs + offset * TOTP_PERIOD_SECONDS * 1000,
    );

    if (candidate === normalizedCode) {
      return true;
    }
  }

  return false;
}

export function getTotpIssuer() {
  return TOTP_ISSUER;
}

function hashRecoveryCode(code: string) {
  return crypto
    .createHash("sha256")
    .update(String(code || "").trim().toUpperCase())
    .digest("hex");
}

export function generateRecoveryCodes(count = 8) {
  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }

  return codes;
}

export function hashRecoveryCodes(codes: string[]) {
  return codes.map(hashRecoveryCode);
}

export function serializeRecoveryCodeHashes(hashes: string[]) {
  return JSON.stringify(hashes);
}

export function parseRecoveryCodeHashes(raw: string | null | undefined) {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}

export function consumeRecoveryCode(
  rawHashes: string | null | undefined,
  candidateCode: string,
) {
  const hashes = parseRecoveryCodeHashes(rawHashes);
  const candidateHash = hashRecoveryCode(candidateCode);
  const matchedIndex = hashes.findIndex((item) => item === candidateHash);

  if (matchedIndex < 0) {
    return {
      matched: false,
      remainingHashes: hashes,
    };
  }

  return {
    matched: true,
    remainingHashes: hashes.filter((_, index) => index !== matchedIndex),
  };
}
