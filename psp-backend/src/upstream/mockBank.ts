import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { PAYMENT_STATUS } from "../core/statuses";

const UPSTREAM_WEBHOOK_URL =
  process.env.UPSTREAM_WEBHOOK_URL ||
  "http://localhost:3000/webhook/upstream/mock_bank/payment-result";

const MOCK_BANK_DISABLE_WEBHOOK = process.env.MOCK_BANK_DISABLE_WEBHOOK === "1";

const BANK_PAYMENT_PROCESSING_MS = 10000;

export async function sendToMockUpsstream(
  prisma: PrismaClient,
  paymentId: string
) {
  // достаем платеж из БД
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    console.warn("Банк-эквайер: Платеж не найден!", paymentId);
    return;
  }
  //простое правило банка :
  //если amount < 5000 => authorized, иначе => declined;

  const amountNumber = Number(payment.amount);
  const newStatus =
    amountNumber < 5000 ? PAYMENT_STATUS.AUTHORIZED : PAYMENT_STATUS.DECLINED;

  // псевдо ID транзакция в банке
  const bankTxId = "BNK_" + paymentId.slice(-6);

  //Имитация задержки банка
  setTimeout(async () => {
    try {
      if (MOCK_BANK_DISABLE_WEBHOOK) {
        console.log(
          `MOCK_BANK_DISABLE_WEBHOOK=1: веб-хук не отправляем, платёж зависнет в PROCESSING до таймаута`
        );
        return;
      }
      await axios.post(
        UPSTREAM_WEBHOOK_URL,
        {
          paymentId: payment.id,
          status: newStatus,
          bankTransactionId: bankTxId,
          raw: {
            source: "mock_upstream",
            rule: "amount < 5000 ? authorized : declined",
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-webhook-sign": process.env.WEBHOOK_SECRET || "",
          },
        }
      );
      console.log(
        `Банк-эквайер: отправлен Веб-хук ${payment.id}, статус=${newStatus}`
      );
    } catch (err) {
      console.log("Банк-эквайер: ошибка отправки Веб-хука", err);
      try {
        //обновляем статус платежа на error
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: PAYMENT_STATUS.ERROR,
          },
        });
        //Пишем событие "error" в историю платежа
        await prisma.paymentEvent.create({
          data: {
            paymentId,
            type: "error",
            status: PAYMENT_STATUS.ERROR,
            payload: {
              note: "Ошибка при отправке вебхука в PSP",
              message: err instanceof Error ? err.message : String(err),
            },
          },
        });
      } catch (innerErr) {
        console.error("Банк-эквайер: ошибка записи статуса error", innerErr);
      }
    }
  }, BANK_PAYMENT_PROCESSING_MS);
}

export async function startProcessing(prisma: PrismaClient, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    console.warn("Платеж не найден", paymentId);
    return;
  }

  if (payment.status !== PAYMENT_STATUS.CREATED) {
    console.warn(
      "Некорректный статус для начала процессинга",
      paymentId,
      "status=",
      payment.status
    );
    return;
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: PAYMENT_STATUS.PROCESSING },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "request",
      status: PAYMENT_STATUS.PROCESSING,
      payload: {
        target: "Банк-эквайер",
        note: "Отправка в банк - обработка транзакции",
      },
    },
  });
  await sendToMockUpsstream(prisma, paymentId).catch((err) =>
    console.error("Ошибка Банк-эквайера при запуске обработки транзакции:", err)
  );
}
