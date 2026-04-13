// импортируем статус-константы (чтобы не писать строки руками)
import e from "express";
import { AppError } from "../core/errors";
import { PAYMENT_STATUS } from "../core/statuses"; //что такое статусы платежа

// импортируем функцию, которую тестируем
import { cancelPayment } from "../core/transitions"; // сама бизнес-функция cancel

// импортируем помощник для глубокой мок- призмы
import { createPrismaMock } from "./helpers/prismaMock"; //делает prisma, где методы = jest.fn()
import express from "express";
import { escape } from "querystring";
import { mergeConfig } from "axios";

describe("core/transition.ts -> cancelPayment", () => {
  test("cancelPayment -> делает update платежа на CANCELLED и пишет событие", async () => {
    const prisma = createPrismaMock(); //создаем фейковую Ptisma

    const existingPayment: any = {
      id: "p1", // id платежа
      merchantId: "m1", // владелец
      status: PAYMENT_STATUS.AUTHORIZED, // <== Важно: поставь статус, из которого у тебя разрешен cancel
    }; // конец найденного платежа

    prisma.payment.findUnique.mockResolvedValue(existingPayment); // если внутри ищут через findUnique
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    const updatePayment: any = {
      ...existingPayment, // копируем поля
      status: PAYMENT_STATUS.CANCELED, // конец updatedPayment
    }; // конец updatedPayment

    prisma.payment.update.mockResolvedValue(updatePayment); //update вернет updatePayment
    prisma.paymentEvent.create.mockResolvedValue({ id: "e1" } as any); //событие  "создалось"

    const result = await cancelPayment(prisma as any, "p1"); //вызываем, то что тестируем

    expect(result.status).toBe(PAYMENT_STATUS.CANCELED); // проверяем: вернулся CANCELLED

    expect(prisma.payment.update).toHaveBeenCalled(); // проверяем: update вообще вызывали

    expect(prisma.payment.update).toHaveBeenCalledWith(
      // проверяем: update вызвали ПРАВИЛЬНО
      expect.objectContaining({
        where: { id: "p1" }, //обновляем именно этот id
        data: expect.objectContaining({
          status: PAYMENT_STATUS.CANCELED, //обновили статус на CANCELLED
        }),
      }),
    );

    expect(prisma.paymentEvent.create).toHaveBeenCalled(); // проверяем: событие истории вообще писали

    expect(prisma.paymentEvent.create).toHaveBeenCalledWith(
      // проверяем: что событие привязано к paymentId
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "p1", // событие относится к p1
          type: "cancel",
          status: PAYMENT_STATUS.CANCELED,
        }),
      }),
    );
  });

  test("cancelPayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если статус НЕ из allowed", async () => {
    const prisma = createPrismaMock();

    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.CAPTURED,
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    await expect(cancelPayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.CAPTURED,
        action: "cancel",
        allowedFrom: [
          PAYMENT_STATUS.CREATED,
          PAYMENT_STATUS.PROCESSING,
          PAYMENT_STATUS.AUTHORIZED,
        ],
      }),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
  test("cancelPayment -> кидает PAYMENT_NOT_FOUND, если платежа нет", async () => {
    const prisma = createPrismaMock();

    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    await expect(cancelPayment(prisma as any, "p_missing")).rejects.toEqual(
      AppError.paymentNotFound("p_missing"),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  test("cancelPayment -> кидает STATUS_TRANSITION_NOT_ALLOWED, если платеж уже CANCELED", async () => {
    const prisma = createPrismaMock();

    const existingPayment: any = {
      id: "p1",
      merchantId: "m1",
      status: PAYMENT_STATUS.CANCELED,
    };

    prisma.payment.findUnique.mockResolvedValue(existingPayment);
    prisma.payment.findFirst.mockResolvedValue(existingPayment);

    await expect(cancelPayment(prisma as any, "p1")).rejects.toEqual(
      AppError.statusTransitionNotAllowed({
        from: PAYMENT_STATUS.CANCELED,
        action: "cancel",
        reason: "Платеж уже отменен",
      }),
    );

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
});
