import { PrismaClient } from "@prisma/client";
import { PAYMENT_STATUS, PaymentStatus } from "./statuses";
import { AppError } from "./errors";
import { getPaymentOrThrow } from "./domain";

export async function capturePayment(prisma: PrismaClient, paymentId: string) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.status === PAYMENT_STATUS.CAPTURED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "capture",
      reason: "Платеж уже списан",
    });
  }

  if (payment.status !== PAYMENT_STATUS.AUTHORIZED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "capture",
      allowedFrom: [PAYMENT_STATUS.AUTHORIZED],
    });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PAYMENT_STATUS.CAPTURED,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: updated.id,
      type: "capture",
      status: PAYMENT_STATUS.CAPTURED,
      payload: {
        note: "Списание средств после авторизации",
      },
    },
  });

  return updated;
}

export async function refundPayment(prisma: PrismaClient, paymentId: string) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.status === PAYMENT_STATUS.REFUNDED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "refund",
      reason: "Платеж в статусе возврата",
    });
  }

  if (payment.status !== PAYMENT_STATUS.CAPTURED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "refund",
      allowedFrom: [PAYMENT_STATUS.CAPTURED],
    });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PAYMENT_STATUS.REFUNDED,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: updated.id,
      type: "refund",
      status: PAYMENT_STATUS.REFUNDED,
      payload: {
        note: "Возврат средств по запросу мерчанта",
      },
    },
  });
  return updated;
}

export async function cancelPayment(prisma: PrismaClient, paymentId: string) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.status === PAYMENT_STATUS.CANCELED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "cancel",
      reason: "Платеж уже отменен",
    });
  }

  // Разрешённые статусы для отмены
  const allowed: PaymentStatus[] = [
    PAYMENT_STATUS.CREATED,
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.AUTHORIZED,
  ];

  if (!allowed.includes(payment.status as PaymentStatus)) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "cancel",
      allowedFrom: allowed,
    });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PAYMENT_STATUS.CANCELED,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: updated.id,
      type: "cancel",
      status: PAYMENT_STATUS.CANCELED,
      payload: {
        note: "Платеж отменен мерчантом до списания средств",
      },
    },
  });

  return updated;
}

export async function retryPayment(prisma: PrismaClient, paymentId: string) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  const allowed: PaymentStatus[] = [
    PAYMENT_STATUS.ERROR,
    PAYMENT_STATUS.TIMEOUT,
  ];

  if (!allowed.includes(payment.status as PaymentStatus)) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "retry",
      allowedFrom: allowed,
    });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PAYMENT_STATUS.PROCESSING,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: updated.id,
      type: "retry",
      status: PAYMENT_STATUS.PROCESSING,
      payload: {
        note: "Повторная отправка платежа в банк после ошибки или таймаута",
        previousStatus: payment.status,
      },
    },
  });

  return updated;
}

//инициация из банка на мерчанта

export async function applyChargeback(
  prisma: PrismaClient,
  paymentId: string,
  reason?: string,
) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.status === PAYMENT_STATUS.CHARGEBACK) {
    // уже в chargeback, повторно не трогаем
    return payment;
  }

  if (payment.status !== PAYMENT_STATUS.CAPTURED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "chargeback",
      allowedFrom: [PAYMENT_STATUS.CAPTURED],
      reason: "Возврат по запросу банка возможен только для списанных платежей",
    });
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: PAYMENT_STATUS.CHARGEBACK,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: updated.id,
      type: "chargeback",
      status: PAYMENT_STATUS.CHARGEBACK,
      payload: {
        note: "Чарджбэк от банка / платеж оспорен клиентом",
        reason: reason || null,
      },
    },
  });

  return updated;
}
