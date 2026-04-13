import express from "express"; // Express router
import { PrismaClient } from "@prisma/client"; // Prisma-клиент
import { statusRules } from "../core/asserts"; // Проверки переходов статусов
import { sendError } from "../core/httpError"; // Единая отправка ошибок
import { AppError } from "../core/errors"; // Бизнес-ошибки
import { PAYMENT_STATUS, PaymentStatus } from "../core/statuses"; // Тип статуса платежа
import {
  capturePayment, // Подтверждение списания
  refundPayment, // Возврат
  cancelPayment, // Отмена
  retryPayment, // Повторная попытка
  applyChargeback, // Демонстрационный chargeback
} from "../core/transitions";
import { getProviderByCode } from "../providers/registry"; // Получение провайдера по коду
import { requireFields } from "../core/requestValidation"; // Проверка обязательных полей
import {
  getMerchantOrThrow, // Получение мерчанта
  getPaymentOrThrow, // Получение платежа
  getPaymentForMerchantOrThrow, // Проверка, что платеж принадлежит мерчанту
} from "../core/domain";
import { createPaymentInit } from "./paymentInitService"; // Сервис создания платежа

// Тип режима процессинга.
type ProcessMode = "auto" | "manual";

// Создаём router для action-роутов.
export function createPaymentActionRouter(
  prisma: PrismaClient, // Prisma-клиент
  cardKey: Buffer, // Ключ для шифрования PAN
  processMode: ProcessMode, // Режим auto/manual
) {
  // Создаём router.
  const router = express.Router();

  // Создание платежа.
  router.post("/payment/init", async (req, res) => {
    try {
      // Проверяем обязательные поля.
      requireFields("body", req.body, [
        "apiKey",
        "amount",
        "currency",
        "cardNumber",
        "expMonth",
        "expYear",
        "cvv",
      ]);

      // Вызываем сервис создания платежа.
      const result = await createPaymentInit(
        prisma, // Prisma-клиент
        req.body, // Данные из body
        cardKey, // Ключ шифрования
      );

      // Отдаём ответ клиенту.
      res.json({
        payment: result.payment,
        card: result.card,
      });

      // Если включён авто-процессинг — запускаем его позже.
      if (processMode === "auto") {
        setTimeout(() => {
          // Находим провайдера по коду, который выбрал сервис.
          const provider = getProviderByCode(result.selectedProviderCode);

          // Запускаем обработку через выбранного провайдера.
          provider
            .startProcessing(prisma, (result.payment as any).id)
            .catch((err) => {
              console.error(
                "Ошибка авто-процессинга после инициализации:",
                err,
              );
            });
        }, 10_000);
      }
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка создания платежа:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  // Ручной запуск процесса платежа.
  router.post("/payment/process", async (req, res) => {
    try {
      // Проверяем, что paymentId пришёл.
      requireFields("body", req.body, ["paymentId"]);

      // Достаём paymentId.
      const { paymentId } = req.body;

      // Получаем платёж.
      const payment = await getPaymentOrThrow(prisma, paymentId);

      // Находим нужного провайдера.
      const provider = getProviderByCode(payment.providerCode);

      // Запускаем обработку через провайдера.
      await provider.startProcessing(prisma, paymentId);

      // Снова читаем платёж, чтобы вернуть реальный статус.
      const updatedPayment = await getPaymentOrThrow(prisma, paymentId);

      // Возвращаем ответ.
      return res.json({
        ok: true,
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        providerCode: updatedPayment.providerCode,
        upstreamId: updatedPayment.upstreamId,
        upstreamStatus: updatedPayment.upstreamStatus,
      });
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка процесса платежа:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  // Capture платежа.
  router.post("/payment/capture", async (req, res) => {
    try {
      // Проверяем обязательные поля.
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      // Достаём данные.
      const { apiKey, paymentId } = req.body;

      // Находим мерчанта.
      const merchant = await getMerchantOrThrow(prisma, apiKey);

      // Проверяем принадлежность платежа.
      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      // Проверяем допустимость перехода.
      try {
        statusRules.capture.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "capture",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      // Делаем capture.
      const updated = await capturePayment(prisma, paymentId);

      // Возвращаем результат.
      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка подтверждения:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  // Refund платежа.
  router.post("/payment/refund", async (req, res) => {
    try {
      // Проверяем обязательные поля.
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      // Достаём данные.
      const { apiKey, paymentId } = req.body;

      // Находим мерчанта.
      const merchant = await getMerchantOrThrow(prisma, apiKey);

      // Проверяем принадлежность платежа.
      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      // Проверяем допустимость перехода.
      try {
        statusRules.refund.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "refund",
          reason: e instanceof Error ? e.message : String(e),
        });
      }

      // Делаем refund.
      const updated = await refundPayment(prisma, paymentId);

      // Возвращаем результат.
      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка возврата:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  // Cancel платежа.
  router.post("/payment/cancel", async (req, res) => {
    try {
      // Проверяем обязательные поля.
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      // Достаём данные.
      const { apiKey, paymentId } = req.body;

      // Находим мерчанта.
      const merchant = await getMerchantOrThrow(prisma, apiKey);

      // Проверяем принадлежность платежа.
      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      // Проверяем допустимость перехода.
      try {
        statusRules.cancel.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "cancel",
          reason: e instanceof Error ? e.message : String(e),
        });
      }

      // Делаем cancel.
      const updated = await cancelPayment(prisma, paymentId);

      // Возвращаем результат.
      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка отмены:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  // Retry платежа.
  router.post("/payment/retry", async (req, res) => {
    try {
      // Проверяем обязательные поля.
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      // Достаём данные.
      const { apiKey, paymentId } = req.body;

      // Находим мерчанта.
      const merchant = await getMerchantOrThrow(prisma, apiKey);

      // Проверяем принадлежность платежа.
      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      // Проверяем допустимость перехода.
      try {
        statusRules.retry.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "retry",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      // Делаем внутренний retry.
      const updated = await retryPayment(prisma, paymentId);

      // Находим провайдера.
      const provider = getProviderByCode(updated.providerCode);

      // Запускаем retry у провайдера.
      await provider.retryProcessing(prisma, paymentId);

      // Читаем платёж заново.
      const updatedPayment = await getPaymentOrThrow(prisma, paymentId);

      // Возвращаем честный ответ.
      return res.json({
        ok: true,
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        providerCode: updatedPayment.providerCode,
        upstreamId: updatedPayment.upstreamId,
        upstreamStatus: updatedPayment.upstreamStatus,
      });
    } catch (err) {
      // Логируем ошибку.
      console.error("Ошибка при повторной оплате:", err);

      // Возвращаем нормальную ошибку клиенту.
      return sendError(res, err);
    }
  });

  router.post("/payment/chargeback", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      const { apiKey, paymentId } = req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.chargeback.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "chargeback",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await applyChargeback(
        prisma,
        paymentId,
        "Симулированный чарджбэк из UI",
      );

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка chargeback:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/simulate-chargeback", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      const { apiKey, paymentId } = req.body;
      const merchant = await getMerchantOrThrow(prisma, apiKey);
      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.chargeback.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "simulate_chargeback",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          upstreamStatus: PAYMENT_STATUS.CHARGEBACK,
        },
      });

      await prisma.paymentEvent.create({
        data: {
          paymentId: updated.id,
          type: "upstream_chargeback_simulated",
          status: updated.status,
          payload: {
            note: "Симулирован внешний сигнал банка о чарджбэке",
            upstreamStatus: PAYMENT_STATUS.CHARGEBACK,
          },
        },
      });

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
        upstreamStatus: updated.upstreamStatus,
      });
    } catch (err) {
      console.error("Ошибка simulate chargeback:", err);
      return sendError(res, err);
    }
  });

  // Возвращаем router.
  return router;
}
