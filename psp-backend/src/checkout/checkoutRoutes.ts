import express from "express"; // Router
import { PrismaClient } from "@prisma/client"; // Prisma
import { requireFields } from "../core/requestValidation"; // Проверка обязательных полей
import { sendError } from "../core/httpError"; // Единая отправка ошибок
import { getMerchantOrThrow } from "../core/domain"; // Поиск мерчанта по apiKey
import { AppError } from "../core/errors"; // Бизнес-ошибки
import {
  createCheckoutSession,
  getCheckoutSessionDetails,
  submitCheckoutPayment,
} from "./checkoutService";

// Создаём router для checkout-маршрутов
export function createCheckoutRouter(
  prisma: PrismaClient,
  cardKey: Buffer,
  processMode: "auto" | "manual",
) {
  // Создаём router
  const router = express.Router();

  // Новый маршрут: создание checkout session
  router.post("/checkout/session", async (req, res) => {
    try {
      // Проверяем обязательные поля
      requireFields("body", req.body, [
        "apiKey",
        "amount",
        "currency",
        "returnUrl",
        "cancelUrl",
      ]);

      // Достаём поля из body
      const {
        apiKey,
        amount,
        currency,
        merchantOrderId,
        returnUrl,
        cancelUrl,
      } = req.body;

      // Ищем мерчанта по apiKey
      const merchant = await getMerchantOrThrow(prisma, String(apiKey));

      const createdSession = await createCheckoutSession(prisma, {
        merchantId: merchant.id,
        amount,
        currency,
        merchantOrderId,
        returnUrl,
        cancelUrl,
      });

      // Базовый адрес frontend-приложения
      const checkoutBaseUrl =
        process.env.CHECKOUT_BASE_URL || "http://localhost:5173";
      const publicApiBaseUrl =
        process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

      // Формируем checkoutUrl так, чтобы React-приложение само открыло нужную страницу
      const checkoutUrl =
        `${checkoutBaseUrl}` +
        `?page=public_checkout` +
        `&sessionId=${createdSession.sessionId}` +
        `&apiBase=${encodeURIComponent(publicApiBaseUrl)}`;

      // Возвращаем ответ
      return res.json({
        sessionId: createdSession.sessionId, // id checkout session
        paymentId: createdSession.payment.id, // внутренний id платежа
        checkoutUrl, // куда отправлять клиента
        expiresAt: createdSession.expiresAt,
        providerCode: "sandbox_public_checkout",
      });
    } catch (err) {
      // Логируем ошибку в консоль
      console.error("Ошибка создания checkout session:", err);

      // Возвращаем нормальную ошибку клиенту
      return sendError(res, err);
    }
  });

  router.get("/checkout/session/:sessionId", async (req, res) => {
    try {
      requireFields("params", req.params, ["sessionId"]);

      const session = await getCheckoutSessionDetails(
        prisma,
        String(req.params.sessionId),
      );

      return res.json(session);
    } catch (err) {
      console.error("Ошибка получения checkout session:", err);
      return sendError(res, err);
    }
  });

  router.post("/checkout/session/pay", async (req, res) => {
    try {
      requireFields("body", req.body, [
        "sessionId",
        "cardNumber",
        "expMonth",
        "expYear",
        "cvv",
      ]);

      const session = await submitCheckoutPayment(
        prisma,
        req.body,
        cardKey,
        processMode,
      );

      return res.json({
        ok: true,
        session,
      });
    } catch (err) {
      console.error("Ошибка публичной checkout-оплаты:", err);
      return sendError(res, err);
    }
  });

  // Возвращаем router наружу
  return router;
}
