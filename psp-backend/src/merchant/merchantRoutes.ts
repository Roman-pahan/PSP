import { Router } from "express"; // Router Express
import { PrismaClient } from "@prisma/client"; // Prisma-клиент
import crypto from "crypto"; // НУЖНО: для генерации apiKey
import { sendError } from "../core/httpError"; // Отправка ошибок
import { AppError } from "../core/errors"; // Бизнес-ошибки
import { getMerchantOrThrow } from "../core/domain"; // Проверка мерчанта
import { requireFields } from "../core/requestValidation"; // Проверка обязательных полей

export function createMerchantRouter(prisma: PrismaClient) {
  const router = Router();

  // health-check
  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // создание мерчанта
  router.post("/create", async (req, res) => {
    try {
      // Проверяем, что name пришёл
      requireFields("body", req.body, ["name"]);

      // Достаём name из body
      const { name } = req.body;

      // Генерируем apiKey
      const apiKey = "mch_" + crypto.randomBytes(16).toString("hex");

      // Создаём мерчанта
      const merchant = await prisma.merchant.create({
        data: { name, apiKey },
      });

      // Возвращаем созданного мерчанта
      res.json(merchant);
    } catch (err) {
      console.error("Ошибка создания мерчанта:", err);
      return sendError(res, err);
    }
  });

  // список мерчантов
  router.get("/merchants", async (_req, res) => {
    try {
      const apiKey = _req.header("x-api-key");

      if (!apiKey) {
        throw AppError.validationMissingFields("headers", ["apiKey"]);
      }

      await getMerchantOrThrow(prisma, apiKey);

      const merchants = await prisma.merchant.findMany();
      res.json(merchants);
    } catch (err) {
      console.error("Ошибка загрузки мерчантов: ", err);
      return sendError(res, err);
    }
  });

  return router;
}
