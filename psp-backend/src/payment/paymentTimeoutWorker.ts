import { PrismaClient } from "@prisma/client"; // Prisma-клиент для работы с базой
import { PAYMENT_STATUS } from "../core/statuses"; // Статусы платежей

// Функция один раз проверяет зависшие платежи
export async function markTimedOutPayments(
  prisma: PrismaClient, // Prisma-клиент
  merchPaymentTimeoutMs: number, // Сколько максимум платеж может висеть в processing
) {
  try {
    // Считаем границу времени:
    // всё, что старше этого момента и всё ещё processing, надо переводить в timeout
    const deadline = new Date(Date.now() - merchPaymentTimeoutMs);

    // Ищем платежи, которые слишком долго висят в processing
    const pending = await prisma.payment.findMany({
      where: {
        status: PAYMENT_STATUS.PROCESSING, // Только processing
        updatedAt: {
          lt: deadline, // Только старше дедлайна
        },
      },
    });

    // Если ничего не нашли — просто выходим
    if (!pending.length) {
      return;
    }

    // Логируем, сколько таких платежей нашли
    console.log(
      `Таймаут: найдено платежей в PROCESSING дольше лимита: ${pending.length}`,
    );

    // Проходим по каждому зависшему платежу
    for (const payment of pending) {
      // Меняем статус платежа на TIMEOUT
      await prisma.payment.update({
        where: { id: payment.id }, // Какой платеж обновляем
        data: {
          status: PAYMENT_STATUS.TIMEOUT, // Новый статус
        },
      });

      // Пишем событие timeout в историю
      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id, // К какому платежу относится событие
          type: "timeout", // Тип события
          status: PAYMENT_STATUS.TIMEOUT, // Статус события
          payload: {
            note: "Истекло время ожидания ответа банка", // Пояснение
            timeoutMs: merchPaymentTimeoutMs, // Какой лимит времени применялся
          },
        },
      });

      // Логируем конкретный платеж
      console.log(`Таймаут: платёж ${payment.id} помечен как TIMEOUT`);
    }
  } catch (err) {
    // Если внутри воркера что-то пошло не так — логируем ошибку
    console.error("Ошибка при обработке таймаутов платежей:", err);
  }
}

// Функция запускает периодическую проверку таймаутов
export function startPaymentTimeoutWorker(
  prisma: PrismaClient, // Prisma-клиент
  merchPaymentTimeoutMs: number, // Через сколько считать платеж зависшим
  merchPaymentTimeoutChecklistMs: number, // Как часто проверять
) {
  // Запускаем периодический таймер
  setInterval(() => {
    // На каждом тике вызываем проверку таймаутов
    markTimedOutPayments(prisma, merchPaymentTimeoutMs).catch((err) => {
      // Если упало именно ожидание Promise — тоже логируем
      console.log("Ошибка в периодической проверке таймаутов", err);
    });
  }, merchPaymentTimeoutChecklistMs);
}
