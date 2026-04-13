import express from "express";
import dotenv from "dotenv";
import cors from "cors"; // Middleware для CORS
import { PrismaClient } from "@prisma/client";

import { createMerchantRouter } from "./merchant/merchantRoutes";
import { createMerchantPortalRouter } from "./merchant/merchantPortalRoutes";
import { createPspAdminRouter } from "./admin/pspAdminRoutes";
import { createMerchantRouter as createBankWebhookRouter } from "./upstream/bankWebhooks";
import { createPaymentReadRouter } from "./payment/paymentReadRoutes";
import { createPaymentActionRouter } from "./payment/paymentActionRoutes";
import { startPaymentTimeoutWorker } from "./payment/paymentTimeoutWorker";
import { createCheckoutRouter } from "./checkout/checkoutRoutes";
import { applySecurityHeaders } from "./core/securityHeaders";
import { createCorsOriginChecker, parseAllowedOrigins } from "./core/corsConfig";

dotenv.config();
const cardKeyHex = process.env.CARD_ENC_KEY;

//Режим старта процессинга: auto или manual
const PROCESS_MODE = (process.env.PROCESS_MODE || "auto") as "auto" | "manual";

const MERCH_PAYMENT_TIMEOUT_MS = Number(
  process.env.MERCH_PAYMENT_TIMEOUT_MS || 60000,
);
const MERCH_PAYMENT_TIMEOUTCHECKLIST_MS = Number(
  process.env.MERCH_PAYMENT_TIMEOUTCHECKLIST_MS || 30000,
);

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 3000;
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
// Разрешаем запросы с фронта Vite
app.use(
  cors({
    origin: createCorsOriginChecker(allowedOrigins),
    credentials: true,
  }),
);

app.use(applySecurityHeaders);
app.use(express.json()); // Парсим JSON body

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "psp-backend",
    port: Number(PORT),
    processMode: PROCESS_MODE,
  });
});

if (!cardKeyHex) {
  throw new Error("Отсуствует секретный ключ карты");
}
const cardKey = Buffer.from(cardKeyHex, "hex"); //превращаем ключ в байтовый вид

//Подключаем мерчантские маршруты
app.use("/merchant", createMerchantRouter(prisma));
app.use("/merchant/portal", createMerchantPortalRouter(prisma));
app.use("/admin/portal", createPspAdminRouter(prisma));
app.use("/webhook/upstream", createBankWebhookRouter(prisma));
app.use(createCheckoutRouter(prisma, cardKey, PROCESS_MODE));
app.use("/", createPaymentReadRouter(prisma));
app.use("/", createPaymentActionRouter(prisma, cardKey, PROCESS_MODE)); // НОВОЕ: action-роуты

app.listen(PORT, () => {
  console.log(`PSP backend running on port ${PORT}`);
});

startPaymentTimeoutWorker(
  prisma, // Prisma-клиент
  MERCH_PAYMENT_TIMEOUT_MS, // Через сколько считать платеж зависшим
  MERCH_PAYMENT_TIMEOUTCHECKLIST_MS, // Как часто проверять
);

//Создание мерчанта

// curl -X POST "http://localhost:3000/merchant/create" \
//   -H "Content-Type: application/json" \
//   -d "{\"name\": \"TestMerchant\"}"

//Создание платежа

// curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d "{
//     \"apiKey\": \"mch_3fbc81d66f4d6efa6ab9a9f802745d9a\",
//     \"amount\": 100.50,
//     \"currency\": \"EUR\",
//     \"cardNumber\": \"4111 1111 1111 1111\",
//     \"expMonth\": 12,
//     \"expYear\": 2030,
//     \"cvv\": \"123\"
//   }"

// curl -X POST http://localhost:3000/webhook/upstream/payment-result \
//     -H "Content-Type: application/json"
//     -H "x-webhook-sign: 094be207fa8af92f9869ece7e16deb7cd296db9c46b7febfba9f51bc6a39a215" \
//     -d "{
//     \"paymentId\": \"cmio0ioky0002tur2995t8aev\",
//     \"status\": \"approved\",
//     \"bankTransactionId\": \"BNK123456\",
//     \"raw\": {\"example\": true}
//   }"

// Подтверждение authorized
// curl -X POST http://localhost:3000/payment/process   -H "Content-Type: application/json"   -d "{
//     \"paymentId\": \"cmio3ew84000fclb3rm5x8sh2\"
//   }"

// Подтверждение списания

//Узнать статус одного платежа
// curl "http://localhost:3000/payment/status?paymentId=ТВОЙ_ID"

//node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//генерация
