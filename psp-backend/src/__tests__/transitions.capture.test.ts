//Импортируем тестирумую функцию capturePayment из transition
import { capturePayment } from "../core/transitions";

// Импортируем статусы, чтобы сравнивать ожидаемый статус после capture
import { PAYMENT_STATUS } from "../core/statuses";

// Импортируем AppError, чтобы сравнивать ошибки
import { AppError } from "../core/errors";

// Импортируем помощник для создания глубокой фейковой Prisma
import { createPrismaMock } from "./helpers/prismaMock";

describe("core/transition.ts -> capturePayment", () => {
  test("capturePayment -> делает update платежа на CAPTURED  и пишет событие", async () => {
    // 1) Создаем фейковую Prisma (все методы - jest.fn())
    const prisma = createPrismaMock();

    // 2) Готовим “существующий” платёж, который вернёт поиск в базе (до update)
    const existingPayment: any = {
      // создаём объект “платёж найден”
      id: "p1", // id платежа
      merchantId: "m1", // владелец платежа
      status: PAYMENT_STATUS.AUTHORIZED, // любой статус, который подходит под capture
    }; // конец объекта

    prisma.payment.findUnique.mockResolvedValue(existingPayment); // если domain.ts ищет через findUnique → вернёт платёж
    prisma.payment.findFirst.mockResolvedValue(existingPayment); // если domain.ts ищет через findFirst → вернёт платёж

    // 3) Готовим "обновленный" платеж, который якобы вернет prisma.payment.update(...)
    const updatedPayment: any = {
      ...existingPayment,
      status: PAYMENT_STATUS.CAPTURED, // ожидаем статус посое capture
    };

    // 4) Мокаем update → "как будто БД обновила"
    prisma.payment.update.mockResolvedValue(updatedPayment);

    // 5)  Мокаем событие → "как будто БД записала событие"
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any);

    // 6) Вызываем функцию, которую тестируем
    const result = await capturePayment(prisma as any, "p1");

    // 7) Проверяем: функция вернула то, что вернул update
    expect(result.status).toBe(PAYMENT_STATUS.CAPTURED);

    // 8) Проверяем: prisma.payment.update вызывали хотя бы раз
    expect(prisma.payment.update).toHaveBeenCalled();

    // 9) (Главное) Проверяем, что update вызывали с нужным where/data
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" }, //где именно обновляем
        data: expect.objectContaining({
          status: PAYMENT_STATUS.CAPTURED,
        }),
      }),
    );

    // 9) Проверяем: записали событие в историю
    expect(prisma.paymentEvent.create).toHaveBeenCalled();

    // 10) Проверяем, чтобы событие привязано к paymentId
    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "p1",
        }),
      }),
    );
  });

  test("capturePayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если платеж уже CAPTURED", async () => {
    //1) Фейковая Prisma
    const prisma = createPrismaMock();

    //2) "Существующий" платеж уже CAPTURED
    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.CAPTURED, //уже списан
    };

    //3) Подстраховка поиска
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    //4) Ожидаем падения промиса с нужной AppError
    await expect(capturePayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.CAPTURED,
        action: "capture",
        reason: "Платеж уже списан",
      }),
    );

    // 5) Важно: если упали раньше - БД не должна обновляться и событие не должны писаться
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
  test("capturePayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если статус НЕ AUTHORIZED (например CREATED)", async () => {
    // 1) Фейковая Prisma
    const prisma = createPrismaMock();

    //2) Платеж в неправильном статусе
    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.CREATED, // ❌ capture запрещён
    };

    //3) Подстраховка поиска
    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    //4) Ожидаем нужную ошибку (allowedEnum - [AUTHORIZED])
    await expect(capturePayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.CREATED,
        action: "capture",
        allowedFrom: [PAYMENT_STATUS.AUTHORIZED],
      }),
    );

    //5) БД не трогали
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("capturePayment -> кидает PAYMENT_NOT_FOUND, если платежа нет", async () => {
    // 1) Фейковая Prisma
    const prisma = createPrismaMock();

    //2) Как будто платеж не найден
    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    //3) Ожидаем paymentNotFound
    await expect(capturePayment(prisma as any, "p_missing")).rejects.toEqual(
      AppError.paymentNotFound("p_missing"),
    );

    //4) БД не трогали (потому что упали на getPaymentOrThrow)
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
});
