// Импортируем то, что тестируем

import { retryPayment } from "../core/transitions";

// Импортируем статусы
import { PAYMENT_STATUS } from "../core/statuses";

//Импортируем AppError для сравнения ошибок
import { AppError } from "../core/errors";

// Импортируем глубокий мок Prisma
import { createPrismaMock } from "./helpers/prismaMock";

describe("core/transitions.ts -> retryPayment", () => {
  test("retryPayment -> обновляет платеж в RETRYING и пишет событие", async () => {
    //1) Создаем фейковую Prisma (все методы - jest.fn)
    const prisma = createPrismaMock();

    //2) Делаем "существующий"  платеж (чтобы getPaymentOrThrow не упал)
    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.ERROR, // логично: retry делают после declinded/failed
      merchantId: "m1",
    };

    // 3) Постраховка: domain.ts может использовать findUnique или findFirst
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    //4) Что вернет prisma.payment.update(...) после обновления
    const updatePayment: any = {
      ...existingPayment,
      status: PAYMENT_STATUS.PROCESSING, // ожидаем, что retryPayment поставит это
    };

    //5) Мокаем update
    prisma.payment.update.mockResolvedValue(updatePayment);

    // 6) Мокаем запись события
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any);

    // 7) Вызываем функцию, которую тестируем
    const result = await retryPayment(prisma as any, "p1");

    //8) Проверяем: вернулся платеж со статусом PROCESSING
    expect(result.status).toBe(PAYMENT_STATUS.PROCESSING);

    //9) Проверяем: update вызывался
    expect(prisma.payment.update).toHaveBeenCalled();

    // 10) Проверяем: update вызывали с нужынми данными
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          status: PAYMENT_STATUS.PROCESSING,
        }),
      }),
    );

    //11) Проверяем: событие записали
    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "p1",
        }),
      }),
    );
  });

  test("retryPayment -> кидает PAYMENT_NOT_FOUND, если платежа нет", async () => {
    //1) Фейковая Prisma
    const prisma = createPrismaMock();

    // 2) Говорим: платеж не найден
    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    // 3) Проверяем, что промис упадент с нужной ошибкой
    await expect(retryPayment(prisma as any, "p_missing")).rejects.toEqual(
      AppError.paymentNotFound("p_missing"),
    );
  });

  test("retryPayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если статус не ERROR и не TIMEOUT", async () => {
    const prisma = createPrismaMock();

    //Платеж в неправильном статусе (например CAPTURED)
    const existingPayment: any = {
      id: "p1",
      status: PAYMENT_STATUS.CAPTURED,
      merchantId: "m1",
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    await expect(retryPayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.CAPTURED,
        action: "retry",
        allowedFrom: [PAYMENT_STATUS.ERROR, PAYMENT_STATUS.TIMEOUT],
      }),
    );
    //База не должна трогаться

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
});
