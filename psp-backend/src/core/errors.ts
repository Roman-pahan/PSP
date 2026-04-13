export type ErrorGroup =
  | "NOT_FOUND"
  | "AUTH"
  | "STATUS"
  | "VALIDATION"
  | "RATE_LIMIT";

export type ErrorCode =
  | "PAYMENT_NOT_FOUND"
  | "MERCHANT_NOT_FOUND"
  | "CARD_NOT_FOUND"
  | "INVALID_WEBHOOK_SIGNATURE"
  | "INVALID_API_KEY"
  | "INVALID_PORTAL_TOKEN"
  | "INVALID_PORTAL_CREDENTIALS"
  | "INVALID_PORTAL_PASSWORD_CONFIRMATION"
  | "INVALID_ADMIN_TOKEN"
  | "INVALID_ADMIN_CREDENTIALS"
  | "INVALID_ADMIN_PASSWORD_CONFIRMATION"
  | "TWO_FACTOR_REQUIRED"
  | "INVALID_TWO_FACTOR_CODE"
  | "TOO_MANY_REQUESTS"
  | "FORBIDDEN_ADMIN_ACTION"
  | "FORBIDDEN_PAYMENT_ACCESS"
  | "STATUS_TRANSITION_NOT_ALLOWED"
  | "VALIDATION_MISSING_FIELDS"
  | "VALIDATION_INVALID_VALUE";

export type ValidationLocation = "body" | "query" | "params" | "headers";

export class AppError extends Error {
  group: ErrorGroup;
  code: ErrorCode;
  httpStatus: number;
  details?: any;

  constructor(
    group: ErrorGroup,
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: any
  ) {
    super(message);
    this.name = "AppError";
    this.group = group;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  private static notFoundBase(
    code: ErrorCode,
    entity: string,
    message: string,
    details?: any
  ) {
    return new AppError("NOT_FOUND", code, message, 404, {
      entity,
      ...details,
    });
  }

  static paymentNotFound(paymentId?: string) {
    return this.notFoundBase(
      "PAYMENT_NOT_FOUND",
      "payment",
      "Платеж не найден",
      paymentId ? { paymentId } : undefined
    );
  }

  static merchantNotFound(apiKey?: string) {
    return this.notFoundBase(
      "MERCHANT_NOT_FOUND",
      "merchant",
      "Мерчант не найден",
      apiKey ? { apiKey } : undefined
    );
  }

  static cardNotFound(cardId?: string) {
    return this.notFoundBase(
      "CARD_NOT_FOUND",
      "card",
      "Карта не найдена",
      cardId ? { cardId } : undefined
    );
  }

  private static authBase(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: any
  ) {
    return new AppError("AUTH", code, message, httpStatus, details);
  }

  static invalidWebhookSignature() {
    return this.authBase(
      "INVALID_WEBHOOK_SIGNATURE",
      "Неверная подпись вебхука",
      401
    );
  }

  static invalidApiKey(apiKey?: string) {
    return this.authBase(
      "INVALID_API_KEY",
      "Неверный API-ключ мерчанта",
      401,
      apiKey ? { apiKey } : undefined
    );
  }

  static invalidPortalToken() {
    return this.authBase(
      "INVALID_PORTAL_TOKEN",
      "Неверный или истекший токен кабинета мерчанта",
      401
    );
  }

  static invalidPortalCredentials() {
    return this.authBase(
      "INVALID_PORTAL_CREDENTIALS",
      "Неверный email или пароль мерчанта",
      401
    );
  }

  static invalidPortalPasswordConfirmation() {
    return this.authBase(
      "INVALID_PORTAL_PASSWORD_CONFIRMATION",
      "Неверный пароль подтверждения мерчанта",
      401
    );
  }

  static invalidAdminToken() {
    return this.authBase(
      "INVALID_ADMIN_TOKEN",
      "Неверный или истекший токен PSP admin",
      401
    );
  }

  static invalidAdminCredentials() {
    return this.authBase(
      "INVALID_ADMIN_CREDENTIALS",
      "Неверный email или пароль PSP admin",
      401
    );
  }

  static invalidAdminPasswordConfirmation() {
    return this.authBase(
      "INVALID_ADMIN_PASSWORD_CONFIRMATION",
      "Неверный пароль подтверждения PSP admin",
      401
    );
  }

  static twoFactorRequired() {
    return this.authBase(
      "TWO_FACTOR_REQUIRED",
      "Для продолжения требуется код 2FA",
      401
    );
  }

  static invalidTwoFactorCode() {
    return this.authBase(
      "INVALID_TWO_FACTOR_CODE",
      "Неверный код 2FA",
      401
    );
  }

  static tooManyRequests(scope: string, retryAfterSeconds?: number) {
    return new AppError(
      "RATE_LIMIT",
      "TOO_MANY_REQUESTS",
      "Слишком много чувствительных запросов. Попробуй чуть позже",
      429,
      {
        scope,
        retryAfterSeconds,
      }
    );
  }

  static forbiddenPaymentAccess(paymentId: string, merchantId?: string) {
    return this.authBase(
      "FORBIDDEN_PAYMENT_ACCESS",
      "Платеж принадлежит другому мерчанту",
      403,
      {
        paymentId,
        merchantId,
      }
    );
  }

  static forbiddenAdminAction(action: string, role?: string) {
    return this.authBase(
      "FORBIDDEN_ADMIN_ACTION",
      `Роль "${role || "unknown"}" не может выполнять действие "${action}"`,
      403,
      {
        action,
        role,
      }
    );
  }

  static statusTransitionNotAllowed(params: {
    from: string;
    to?: string;
    action?: string;
    allowedFrom?: string[];
    reason?: string;
  }) {
    const { from, to, action, allowedFrom, reason } = params;

    let message: string;
    if (to) {
      message = `Статус "${from}" не подходит для перехода в статус "${to}"`;
    } else if (action) {
      message = `Статус "${from}" не подходит для операции "${action}"`;
    } else {
      message = `Статус "${from}" не подходит для этого действия`;
    }

    return new AppError(
      "STATUS",
      "STATUS_TRANSITION_NOT_ALLOWED",
      message,
      400,
      {
        from,
        to,
        action,
        allowedFrom,
        reason,
      }
    );
  }

  static validationError(message: string, details?: any) {
    return new AppError(
      "VALIDATION",
      "VALIDATION_INVALID_VALUE",
      message,
      400,
      details
    );
  }

  static validationMissingFields(
    location: ValidationLocation,
    fields: string[],
    extraMessage?: string
  ) {
    const base = `Отсутствуют обязательные поля в ${location}`;
    const message =
      extraMessage && extraMessage.trim().length > 0
        ? `${base}: ${extraMessage}`
        : `${base}: ${fields.join(", ")}`;

    return new AppError(
      "VALIDATION",
      "VALIDATION_MISSING_FIELDS",
      message,
      400,
      {
        location,
        missing: fields,
      }
    );
  }

  static validationInvalidField(
    location: ValidationLocation,
    field: string,
    reason?: string,
    safeValue?: any
  ) {
    const msgReason = reason ? `:${reason}` : "";
    const maskedPart =
      safeValue !== undefined ? `(masked: ${String(safeValue)})` : "";
    const base = `Неверное значение поля "${field}" в ${location}`;
    const message = `${base}${msgReason}${maskedPart}`;

    return new AppError(
      "VALIDATION",
      "VALIDATION_INVALID_VALUE",
      message,
      400,
      {
        location,
        field,
        value: safeValue,
        reason,
      }
    );
  }
}
