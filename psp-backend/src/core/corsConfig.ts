type CorsOrigin = string | boolean;

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173"];

export function parseAllowedOrigins(raw: string | undefined) {
  const normalized = String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length ? normalized : DEFAULT_ALLOWED_ORIGINS;
}

function matchesWildcardOrigin(origin: string, allowedOrigin: string) {
  const normalizedAllowed = String(allowedOrigin || "").trim().toLowerCase();
  const normalizedOrigin = String(origin || "").trim().toLowerCase();

  if (!normalizedAllowed.includes("*")) {
    return false;
  }

  const escaped = normalizedAllowed.replace(
    /[.+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const pattern = `^${escaped.replace(/\*/g, ".*")}$`;

  return new RegExp(pattern, "i").test(normalizedOrigin);
}

export function createCorsOriginChecker(allowedOrigins: string[]) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: CorsOrigin) => void) => {
    if (!origin) {
      return callback(null, true);
    }

    if (
      allowedOrigins.includes(origin) ||
      allowedOrigins.some((allowedOrigin) =>
        matchesWildcardOrigin(origin, allowedOrigin),
      )
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin is not allowed: ${origin}`));
  };
}
