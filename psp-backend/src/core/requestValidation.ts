import { AppError, ValidationLocation } from "./errors";

export function maskPanForError(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "NO_DIGITS";

  // делаем массив из X
  const masked = "X".repeat(digits.length);

  // разбиваем по 4
  return masked.match(/.{1,4}/g)!.join(" ");
}

export function requireFields(
  location: ValidationLocation,
  data: any,
  fields: string[]
) {
  const missing = fields.filter(
    (f) => data == null || data[f] == null || data[f] == ""
  );

  if (missing.length > 0) {
    throw AppError.validationMissingFields(location, missing);
  }
}
