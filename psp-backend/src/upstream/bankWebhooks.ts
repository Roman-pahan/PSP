import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { PAYMENT_STATUS, PaymentStatus } from "../core/statuses";
import { capturePayment, applyChargeback } from "../core/transitions";
import { statusRules } from "../core/asserts";
import { sendError } from "../core/httpError";
import { AppError } from "../core/errors";
import { getPaymentOrThrow } from "../core/domain";
import { getProviderByCode } from "../providers/registry"; // ДОБАВИЛИ: берём провайдера по умолчанию.

//Режим списания средств: manual или auto
const CAPTURE_MODE = (process.env.CAPTURE_MODE || "manual") as
  | "manual"
  | "auto";

// Это нужно, чтобы потом провайдер мог вызвать её сам.
export async function handleMockBankPaymentResultWebhook(
  prisma: PrismaClient,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Берём подпись webhook из заголовка.
    const signature = req.headers["x-webhook-sign"];
    // Проверяем подпись.
    if (signature !== process.env.WEBHOOK_SECRET) {
      throw AppError.invalidWebhookSignature();
    }
    // Достаем нужны поля из тела запроса
    const { paymentId, status, bankTransactionId, raw } = req.body;
    //готовим массив отсутствующих полей
    const missing: string[] = [];

    // Если нет paymentId — добавляем в список.
    if (!paymentId) missing.push("paymentId");
    // Если нет status - добавляем в список
    if (!status) missing.push("status");

    //Если список не пустой - кидаем ошибку валидации
    if (missing.length > 0) {
      throw AppError.validationMissingFields("body", missing);
    }

    //Получаем платеж из базы
    const payment = await getPaymentOrThrow(prisma, paymentId);

    const finalStatuses: PaymentStatus[] = [
      PAYMENT_STATUS.TIMEOUT,
      PAYMENT_STATUS.ERROR,
      PAYMENT_STATUS.CAPTURED,
      PAYMENT_STATUS.DECLINED,
      PAYMENT_STATUS.CANCELED,
      PAYMENT_STATUS.REFUNDED,
      PAYMENT_STATUS.CHARGEBACK,
    ];

    if (finalStatuses.includes(payment.status as PaymentStatus)) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          upstreamId: bankTransactionId || paymentId,
          upstreamStatus: status,
        },
      });

      await prisma.paymentEvent.create({
        data: {
          paymentId: paymentId,
          type: "late_response",
          status: payment.status,
          payload: {
            note: "Поздний веб-хук от банка, статус не меняем",
            upstreamStatus: status,
            bankTransactionId: bankTransactionId || null,
            raw: raw || req.body,
          },
        },
      });
      res.json({ ok: true, ignored: true });
      return;
    }
    // Обычный сценарий: обновляем статус платежа.
    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        upstreamId: bankTransactionId || null,
        upstreamStatus: status,
      },
    });

    await prisma.paymentEvent.create({
      data: {
        paymentId: updated.id,
        type: "response",
        status,
        payload: {
          note: "Ответ банка по веб-хуку",
          upstreamStatus: status,
          bankTransactionId: bankTransactionId || null,
          raw: raw || req.body,
        },
      },
    });
    // Если включён auto capture и банк вернул authorized —
    // пробуем автоматически сделать capture.
    if (CAPTURE_MODE === "auto" && status === PAYMENT_STATUS.AUTHORIZED) {
      try {
        // Проверяем, что capture из этого статуса разрешён.
        statusRules.capture.ensure(updated.status as PaymentStatus);

        setTimeout(() => {
          capturePayment(prisma, updated.id).catch((err) => {
            console.error("Ошибка авто-capture после авторизации", err);
          });
        }, 10000);
      } catch (err) {
        // Если capture не удался — просто логируем.
        console.error("Ошибка авто-capture после авторизации", err);
      }
    }

    //Отправляем успешный ответ.
    res.json({ ok: true });
  } catch (err) {
    //Логируем ошибку
    console.error("Ошибка Веб-хука:", err);

    //Отправляем ошибку клиенту.
    sendError(res, err);
  }
}

export async function handleMockBankChargebackWebhook(
  prisma: PrismaClient,
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const signature = req.headers["x-webhook-sign"];

    if (signature !== process.env.WEBHOOK_SECRET) {
      throw AppError.invalidWebhookSignature();
    }

    const { paymentId, reason, raw } = req.body;

    if (!paymentId) {
      throw AppError.validationMissingFields("body", ["paymentId"]);
    }

    //Получаем платеж из базы.
    const payment = await getPaymentOrThrow(prisma, paymentId);

    // Статусы, в которых поздний chargeback уже не должен менять основной статус.
    const finalStatusesForChargeback: PaymentStatus[] = [
      PAYMENT_STATUS.REFUNDED,
      PAYMENT_STATUS.CHARGEBACK,
      PAYMENT_STATUS.CANCELED,
      PAYMENT_STATUS.TIMEOUT,
    ];

    // Если chargeback пришел поздно - только пишем событие.
    if (finalStatusesForChargeback.includes(payment.status as PaymentStatus)) {
      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id,
          type: "late_chargeback",
          status: payment.status,
          payload: {
            note: "Поздний чарджбэк, статус платежа не меняем",
            reason: reason || null,
            raw: raw || req.body,
          },
        },
      });
      // Возвращаем, что webhook принят, но проигнорирован для статуса.
      res.json({ ok: true, ignored: true });
      return;
    }

    //Применяем chargeback по основной логике.
    await applyChargeback(prisma, paymentId, reason);

    //Дополнительно проверяем допустимость перехода.
    statusRules.chargeback.ensure(payment.status as PaymentStatus);
    // возвращаем, что webhook принят, но пригнорирован для статуса
    res.json({ ok: true });
    return;
  } catch (err) {
    //Логируем ошибку
    console.error("Ошибка возрвата по запросу от клиента", err);

    //Отправляем ошибку клиенту.
    sendError(res, err);
  }
}

// Старый router пока ОСТАВЛЯЕМ.
// Это важно: мы ещё ничего не ломаем.
// Просто router теперь делегирует в новые функции.

export function createMerchantRouter(prisma: PrismaClient) {
  // Создаём express router.
  const router = express.Router();

  // Старый endpoint payment-result остаётся.
  router.post("/:providerCode/payment-result", async (req, res) => {
    // Достаём providerCode из параметров маршрута.
    const { providerCode } = req.params;

    // Находим нужного провайдера по его коду.
    const provider = getProviderByCode(providerCode);
    // Но логика теперь живёт в отдельной функции.
    await provider.handlePaymentResultWebhook(prisma, req, res);
  });

  // Старый endpoint chargeback тоже остаётся.
  router.post("/:providerCode/chargeback", async (req, res) => {
    // Достаём providerCode из параметров маршрута.
    const { providerCode } = req.params;

    // Находим нужного провайдера по его коду.
    const provider = getProviderByCode(providerCode);
    // И тоже делегирует в отдельную функцию.
    await provider.handleChargebackWebhook(prisma, req, res);
  });

  // Возвращаем router.
  return router;
}
