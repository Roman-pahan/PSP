// Импортируем объект со статусами платежа (типа CREATED / AUTHORIZED / CAPTURED и т.д.)
import { PAYMENT_STATUS } from "../core/statuses";

//Импортируем правила статусов (там capture/refund/cancel/retry  и у каждого ensure(...))
import { statusRules } from "../core/asserts";

describe("core/asserts.ts -> statusRules", () => {
  test("capture.ensure -> НЕ кидает ошибку, если статус разрешён", () => {
    const allowedStatus = PAYMENT_STATUS.AUTHORIZED as any;

    //Проверяем: вызор ensure Не должен кидать ошибку
    expect(() => {
      //Вызываем проверку правила
      statusRules.capture.ensure(allowedStatus);
    }).not.toThrow(); // <-- значит правило пропустило статус
  });
  test("capture.ensure -> КИДАЕТ ошибку, если статус запрещён", () => {
    // Берём статус, который ТОЧНО не должен подходить под capture (обычно CREATED)
    const forbiddenStatus = PAYMENT_STATUS.CREATED as any;

    expect(() => {
      //Вызываем проверку правила
      statusRules.capture.ensure(forbiddenStatus);
    }).toThrow();
  });

  test("refund.ensure -> Не кидает ошибку, если статус разрешен", () => {
    //Обычно refund разрешен после CAPTURED
    const allowedStatus = PAYMENT_STATUS.CAPTURED as any;

    expect(() => {
      //Проверяем правило refund
      statusRules.refund.ensure(allowedStatus);
    }).not.toThrow();
  });

  test("refund.ensure -> КИДАЕТ ошибку, если статус запрещён", () => {
    // Обычно refund нельзя из CREATED
    const forbiddenStatus = PAYMENT_STATUS.CREATED as any;

    //Должна быть ошибка
    expect(() => {
      //проверяем правило refund
      statusRules.refund.ensure(forbiddenStatus);
    }).toThrow();
  });

  test("cancel.ensure -> не кидает огибку, если статус разререшен", () => {
    expect(() => {
      statusRules.cancel.ensure(PAYMENT_STATUS.CREATED);
      statusRules.cancel.ensure(PAYMENT_STATUS.PROCESSING);
      statusRules.cancel.ensure(PAYMENT_STATUS.AUTHORIZED);
    }).not.toThrow();
  });

  test("retry.ensure -> не кидает ошибку, если статус разрешен", () => {
    expect(() => {
      statusRules.retry.ensure(PAYMENT_STATUS.ERROR);
      statusRules.retry.ensure(PAYMENT_STATUS.TIMEOUT);
    }).not.toThrow();
  });

  test("retry.ensure -> кидает ошибку, если статус запрещен", () => {
    expect(() => {
      statusRules.retry.ensure(PAYMENT_STATUS.DECLINED);
    }).toThrow();
  });

  test("chargeback.ensure -> не кидает ошибку, если статус разрешен", () => {
    expect(() => {
      statusRules.chargeback.ensure(PAYMENT_STATUS.CAPTURED);
    }).not.toThrow();
  });

  test("chargeback.ensure -> кидает ошибку, если статус запрещен", () => {
    expect(() => {
      statusRules.chargeback.ensure(PAYMENT_STATUS.AUTHORIZED);
    }).toThrow();
  });
});
