// Импортируем то, что тестируем

import { fileURLToPath } from "url";
import { AppError } from "../core/errors";
import { error } from "console";

test("AppError.invalidApiKey -> AUTH / INVALID_API_KEY / 401", () => {
  // 1) Создаем ошибку "неверный ключ"
  const err = AppError.invalidApiKey("bad-key");

  //2) Проверяем группу (тип ошибки)
  expect(err.group).toBe("AUTH");

  //3) Проверяем код (машинный код)
  expect(err.code).toBe("INVALID_API_KEY");
  expect(err.httpStatus).toBe(401);

  //4) Проверяем, что в message есть текст
  expect(typeof err.message).toBe("string");
  expect(err.message.length).toBeGreaterThan(0);

  //проверяем details
  expect(err.details).toEqual(
    expect.objectContaining({
      apiKey: "bad-key",
    }),
  );
});

test("AppError.validationMissingFields -> VALIDATION / VALIDATION_MISSING_FIELDS / 400", () => {
  //1) Создаем ошибку "не хватает полей"
  const err = AppError.validationMissingFields("body", ["a", "b"], "пояснение"); //список сломанных или отсутсвующих имен

  expect(err.message).toContain("пояснение");

  //2) Проверяем группу
  expect(err.group).toBe("VALIDATION");

  // 3) Проверяем код
  expect(err.code).toBe("VALIDATION_MISSING_FIELDS");

  // 4) Проверяем HTTP статус
  expect(err.httpStatus).toBe(400);

  // 5) Проверяем, что в details есть location и required
  expect(err.details).toEqual(
    expect.objectContaining({
      location: "body",
      missing: ["a", "b"],
    }),
  );

  // 6) В message должны быть перечислены поля
  expect(err.message).toContain("body");
});

test("AppError.validationInvalidField -> VALIDATION_INVALID_VALUE / 400", () => {
  const err = AppError.validationInvalidField(
    "body",
    "cardnumber",
    "bad format",
    "XXXX",
  );

  expect(err.group).toBe("VALIDATION");
  expect(err.code).toBe("VALIDATION_INVALID_VALUE");
  expect(err.httpStatus).toBe(400);

  expect(err.details).toEqual(
    expect.objectContaining({
      location: "body",
      field: "cardnumber",
      value: "XXXX",
      reason: "bad format",
    }),
  );

  expect(err.message).toContain("cardnumber");
  expect(err.message).toContain("bad format");
  expect(err.message).toContain("masked: XXXX");
});

test("AppError.forbiddenPaymentAccess -> AUTH / FORBIDDEN_PAYMENT_ACCESS / 403", () => {
  const err = AppError.forbiddenPaymentAccess("p1", "m1");

  expect(err.group).toBe("AUTH");
  expect(err.code).toBe("FORBIDDEN_PAYMENT_ACCESS");
  expect(err.httpStatus).toBe(403);

  expect(err.details).toEqual(
    expect.objectContaining({
      paymentId: "p1",
      merchantId: "m1",
    }),
  );
});

test("AppError.merchantNotFound -> NOT_FOUND / MERCHANT_NOT_FOUND / 404", () => {
  // 1) Создаём ошибку "мерчант не найден"
  const err = AppError.merchantNotFound("mch_123");

  // 2) Проверяем группу
  expect(err.group).toBe("NOT_FOUND");

  // 3) Код
  expect(err.code).toBe("MERCHANT_NOT_FOUND");

  //4) HTTP статус
  expect(err.httpStatus).toBe(404);

  //5) Детали должны содержадть entity=merchant и apiKey
  expect(err.details).toEqual(
    expect.objectContaining({
      entity: "merchant",
      apiKey: "mch_123",
    }),
  );
});

test("AppError.statusTransitionNotAllowed -> STATUS / STATUS_TRANSITION_NOT_ALLOWED / 400", () => {
  // 1) Создаем ошибку "переход запрещен"

  const err = AppError.statusTransitionNotAllowed({
    from: "created",
    to: "captured",
    reason: "нельзя так",
  });

  //2) Группа
  expect(err.group).toBe("STATUS");

  //3) Код
  expect(err.code).toBe("STATUS_TRANSITION_NOT_ALLOWED");

  // 4) HTTP статус
  expect(err.httpStatus).toBe(400);

  //5) Детали должны содержать from/to/reason
  expect(err.details).toEqual(
    expect.objectContaining({
      from: "created",
      to: "captured",
      reason: "нельзя так",
    }),
  );

  // 6) Message должен быть строкой и содержать from/to
  expect(err.message).toContain("created");
  expect(err.message).toContain("captured");
});

test('AppError.statusTransitionNotAllowed -> если есть "to", message про переход', () => {
  //1) Создаем ошибку: переход из Created в Captured
  const err = AppError.statusTransitionNotAllowed({
    from: "CREATED",
    to: "CAPTURED",
  });

  // 2) Проверяем метаданные ошибки
  expect(err.group).toBe("STATUS");
  expect(err.code).toBe("STATUS_TRANSITION_NOT_ALLOWED");
  expect(err.httpStatus).toBe(400);

  // 3) Проверяем текст сообщения (самое важное)
  expect(err.message).toBe(
    'Статус "CREATED" не подходит для перехода в статус "CAPTURED"',
  );

  // 4) Проверяем detaild (что туда записалось)
  expect(err.details).toEqual(
    expect.objectContaining({
      from: "CREATED",
      to: "CAPTURED",
    }),
  );
});

test('AppError.statusTransitionNotAllowed -> если нет "to", но есть "action", message про операцию', () => {
  // 1) Создаём ошибку: операция capture из DECLINED
  const err = AppError.statusTransitionNotAllowed({
    from: "DECLINED", //текущий статус
    action: "capture",
  });

  //2) Проверяем текст сообщения
  expect(err.message).toBe(
    'Статус "DECLINED" не подходит для операции "capture"',
  );

  //3)Проверяем, что action реально попал в deltails
  expect(err.details).toEqual(
    expect.objectContaining({
      from: "DECLINED",
      action: "capture",
    }),
  );
});

test('AppError.statusTransitionNotAllowed -> если нет ни "to", ни "action", message общий', () => {
  //1) Создаем ошибку: просто "не подходит"
  const err = AppError.statusTransitionNotAllowed({
    from: "PROCESSING", //текущий статус
  });

  //2) Проверяем текст сообщения
  expect(err.message).toBe(
    'Статус "PROCESSING" не подходит для этого действия',
  );

  //3) Проверяем, что from записался в details
  expect(err.details).toEqual(
    expect.objectContaining({
      from: "PROCESSING",
    }),
  );
});

test("AppError.invalidWebhookSignature -> AUTH / INVALID_WEBHOOK_SIGNATURE / 401", () => {
  const err = AppError.invalidWebhookSignature();

  expect(err.group).toBe("AUTH");
  expect(err.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  expect(err.httpStatus).toBe(401);
  expect(err.message).toContain("Неверная подпись");
});

test("AppError.cardNotFound -> NOT_FOUND / CARD_NOT_FOUND / 404", () => {
  const err = AppError.cardNotFound("c1");

  expect(err.group).toBe("NOT_FOUND");
  expect(err.code).toBe("CARD_NOT_FOUND");
  expect(err.httpStatus).toBe(404);

  expect(err.details).toEqual(
    expect.objectContaining({
      entity: "card",
      cardId: "c1",
    }),
  );
});

test("AppError.validationError -> VALIDATION / VALIDATION_INVALID_VALUE / 400", () => {
  const err = AppError.validationError("Плохое значение", { field: "amount" });

  expect(err.group).toBe("VALIDATION");
  expect(err.code).toBe("VALIDATION_INVALID_VALUE");
  expect(err.httpStatus).toBe(400);
  expect(err.message).toBe("Плохое значение");

  expect(err.details).toEqual(
    expect.objectContaining({
      field: "amount",
    }),
  );
});

test("AppError.paymentNotFound -> без paymentId", () => {
  const err = AppError.paymentNotFound();

  expect(err.group).toBe("NOT_FOUND");
  expect(err.code).toBe("PAYMENT_NOT_FOUND");
  expect(err.httpStatus).toBe(404);

  expect(err.details).toEqual(
    expect.objectContaining({
      entity: "payment",
    }),
  );

  expect(err.details.paymentId).toBeUndefined();
});

test("AppError.merchantNotFound -> без apiKey", () => {
  const err = AppError.merchantNotFound();

  expect(err.group).toBe("NOT_FOUND");
  expect(err.code).toBe("MERCHANT_NOT_FOUND");
  expect(err.httpStatus).toBe(404);

  expect(err.details).toEqual(
    expect.objectContaining({
      entity: "merchant",
    }),
  );

  expect(err.details.apiKey).toBeUndefined();
});

test("AppError.cardNotFound -> без cardId", () => {
  const err = AppError.cardNotFound();

  expect(err.group).toBe("NOT_FOUND");
  expect(err.code).toBe("CARD_NOT_FOUND");
  expect(err.httpStatus).toBe(404);

  expect(err.details).toEqual(
    expect.objectContaining({
      entity: "card",
    }),
  );

  expect(err.details.cardId).toBeUndefined();
});

test("AppError.validationInvalidField -> без reason", () => {
  const err = AppError.validationInvalidField(
    "body",
    "cardnumber",
    undefined,
    "XXXX",
  );

  expect(err.group).toBe("VALIDATION");
  expect(err.code).toBe("VALIDATION_INVALID_VALUE");
  expect(err.httpStatus).toBe(400);

  expect(err.details).toEqual(
    expect.objectContaining({
      location: "body",
      field: "cardnumber",
      value: "XXXX",
      reason: undefined,
    }),
  );

  expect(err.message).toContain("cardnumber");
  expect(err.message).toContain("masked: XXXX");
});

test("AppError.validationInvalidField -> без safeValue", () => {
  const err = AppError.validationInvalidField(
    "body",
    "cardnumber",
    "bad format",
  );

  expect(err.group).toBe("VALIDATION");
  expect(err.code).toBe("VALIDATION_INVALID_VALUE");
  expect(err.httpStatus).toBe(400);

  expect(err.details).toEqual(
    expect.objectContaining({
      location: "body",
      field: "cardnumber",
      value: undefined,
      reason: "bad format",
    }),
  );
  expect(err.message).toContain("cardnumber");
  expect(err.message).toContain("bad format");
  expect(err.message).not.toContain("masked:");
});

test('AppError.statusTransitionNotAllowed -> если нет ни "to", ни "action", message общий', () => {
  const err = AppError.statusTransitionNotAllowed({
    from: "PROCESSING",
  });

  expect(err.group).toBe("STATUS");
  expect(err.code).toBe("STATUS_TRANSITION_NOT_ALLOWED");
  expect(err.httpStatus).toBe(400);

  expect(err.message).toBe(
    'Статус "PROCESSING" не подходит для этого действия',
  );

  expect(err.details).toEqual(
    expect.objectContaining({
      from: "PROCESSING",
    }),
  );
});

test("AppError.invalidApiKey -> без apiKey", () => {
  const err = AppError.invalidApiKey();

  expect(err.group).toBe("AUTH");
  expect(err.code).toBe("INVALID_API_KEY");
  expect(err.httpStatus).toBe(401);
  expect(err.details).toBeUndefined();
});
