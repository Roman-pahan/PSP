import { refundPayment } from "../core/transitions";
import { PAYMENT_STATUS } from "../core/statuses";
import { createPrismaMock } from "./helpers/prismaMock";
import { AppError } from "../core/errors";

describe("core/transitions.ts -> refundPayment", () => {
  test("refundPayment -> обновляет платеж в REFUNDED  и пишет событие", async () => {
    // 1) фейковая Prisma
    const prisma = createPrismaMock();

    // 3) Готовим "существующий" платеж (который функция найдет в БД)
    const existingPayment: any = {
      id: "p1", // тот же paymentId, что мы передаем в refundPayment(...)
      status: PAYMENT_STATUS.CAPTURED, // логично: возврат обычно делается после capture
      merchantId: "m1", // просто реализм
    };

    // 4) Говорим Prisma: "платёж найден" (domain.ts может использовать findUnique ИЛИ findFirst)
    prisma.payment.findUnique.mockResolvedValue(existingPayment); // если внутри будет findUnique(...)
    prisma.payment.findFirst.mockResolvedValue(existingPayment); // если внутри будет findFirst(...)

    // 2) что вернет update
    const updatePayment: any = {
      ...existingPayment,
      status: PAYMENT_STATUS.REFUNDED,
    };

    // 5) мок update
    prisma.payment.update.mockResolvedValue(updatePayment);

    //6) мок события
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any);

    //7) вызываем реальную функцию
    const result = await refundPayment(prisma as any, "p1");

    //8) вернулся правильный статус
    expect(result.status).toBe(PAYMENT_STATUS.REFUNDED);

    //7) update реально вызывался
    expect(prisma.payment.update).toHaveBeenCalled();

    // 9) update вызывали с нужным статусом
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          status: PAYMENT_STATUS.REFUNDED,
        }),
      }),
    );

    //10) событие записано
    expect(prisma.paymentEvent.create).toHaveBeenCalled();

    //11) событие привязано к платежу

    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "p1",
          type: "refund",
          status: PAYMENT_STATUS.REFUNDED,
        }),
      }),
    );
  });

  test("refundPayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если платеж уже REFUNDED", async () => {
    const prisma = createPrismaMock();

    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.REFUNDED,
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    await expect(refundPayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.REFUNDED,
        action: "refund",
        reason: "Платеж в статусе возврата",
      }),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("refundPayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если статус не CAPTURED", async () => {
    const prisma = createPrismaMock();

    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.AUTHORIZED, // неверный статус для refund
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    await expect(refundPayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.AUTHORIZED,
        action: "refund",
        allowedFrom: [PAYMENT_STATUS.CAPTURED],
      }),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("refundPayment -> кидает PAYMENT_NOT_FOUND, если платежа нет", async () => {
    const prisma = createPrismaMock();

    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    await expect(refundPayment(prisma as any, "p_missing")).rejects.toEqual(
      AppError.paymentNotFound("p_missing"),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
});
