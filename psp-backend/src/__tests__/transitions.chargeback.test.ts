// Тестируем applyChargeback (чарджбэк)

// 1) Импортируем то, что тестируем
import { applyChargeback } from "../core/transitions";

//2) Импортируем статусы
import { PAYMENT_STATUS } from "../core/statuses";

//3) Импортируем AppError для сравнения ошибок
import { AppError } from "../core/errors";

//4) Импортируем глубокий мок
import { createPrismaMock } from "./helpers/prismaMock";
import { Prisma } from "@prisma/client";

describe("core/transitions.ts -> applyChargeback", () => {
  test("applyChargeback -> если платеж CAPTURED, ставит CHARGEBACK и пишет событие", async () => {
    //1) Создаем фейковую Prisma
    const prisma = createPrismaMock();
    //2) Делаем "существующий" платеж в CAPTURED (иначе чаржбэк нельзя)
    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.CAPTURED,
      merchantId: "m1",
    };

    //3) Подстаховка: getPaymentOrThrow может дергать findUnique или findFirst
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    //4) Что вернет prisma.payment.update(...) после обновления
    const updatePayment: any = {
      ...existingPayment,
      status: PAYMENT_STATUS.CHARGEBACK,
    };

    //5) Мокаем update (как будто БД обновилась запись)
    prisma.payment.update.mockResolvedValue(updatePayment);

    //6) Мокаем создание события (нам важен сам факт вызова)
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any);

    //7) Вызываем функцию (reason передаем)
    const result = await applyChargeback(prisma as any, "p1", "FRAUD");

    //8) Проверяем: функция вернула платеж уже в Chargeback
    expect(result.status).toBe(PAYMENT_STATUS.CHARGEBACK);

    //9) Проверяем: update дернули с нужным статусом
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          status: PAYMENT_STATUS.CHARGEBACK,
        }),
      }),
    );

    //10) Проверяем: событие записали и привязали к paymentId
    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "p1",
          type: "chargeback",
          status: PAYMENT_STATUS.CHARGEBACK,
          payload: expect.objectContaining({
            reason: "FRAUD",
          }),
        }),
      }),
    );
  });

  test("applyChargeback -> если платеж уже CHARGEBACK, возвращает платеж и НЕ пишет в БД", async () => {
    // 1) Фейковая Prisma
    const prisma = createPrismaMock();

    //2) Платеж уже в CHARGEBACK
    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.CHARGEBACK,
      merchantId: "m1",
    };

    // 3) getPaymentOrThrow должен найти этот платеж
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    //4) Вызываем функцию
    const result = await applyChargeback(prisma as any, "p1", "ANY");

    //5) Вернулся тот же платеж (ничего не меняли)
    expect(result.status).toBe(PAYMENT_STATUS.CHARGEBACK);

    //6) Главное: update НЕ должен быть вызван
    expect(prisma.payment.update).not.toHaveBeenCalled();

    //7) И событие  не должно быть создано
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("applyChargeback -> если платеж НЕ CAPTURED, кидает STATUS_TRANSITION_NOT_ALLOWED", async () => {
    // 1) Фейковая Prisma
    const prisma = createPrismaMock();

    //2) Платеж НЕ списан (например AUTHORIZED) -> чарджбэк запрещен
    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.AUTHORIZED,
      merchantId: "m1",
    };

    //getPaymentOrThrow должен найти платеж
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);
    //4) Проверяем: промис падает с правильной AppError
    await expect(applyChargeback(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.AUTHORIZED,
        action: "chargeback",
        allowedFrom: [PAYMENT_STATUS.CAPTURED],
        reason:
          "Возврат по запросу банка возможен только для списанных платежей",
      }),
    );

    //5) Дополннительно: БД не трогали
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("applyChargeback -> если reason не передан, в payload.reason идет null", async () => {
    const prisma = createPrismaMock();

    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.CAPTURED,
      merchantId: "m1",
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    const updatedPayment: any = {
      ...existingPayment,
      status: PAYMENT_STATUS.CHARGEBACK,
    };

    prisma.payment.update.mockResolvedValue(updatedPayment);
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any);

    await applyChargeback(prisma as any, "p1");

    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            reason: null,
          }),
        }),
      }),
    );
  });
});
