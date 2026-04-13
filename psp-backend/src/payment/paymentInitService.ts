import { PrismaClient } from "@prisma/client"; // Prisma-клиент для работы с базой.
import { AppError } from "../core/errors"; // Твои бизнес-ошибки.
import { PAYMENT_STATUS } from "../core/statuses"; // Статусы платежей.
import { maskPanForError } from "../core/requestValidation"; // Маскирование PAN для ошибок.
import { getMerchantOrThrow } from "../core/domain"; // Получение мерчанта по apiKey.
import { encryptPan } from "../core/cardCrypto"; // Шифрование PAN.
import { getProviderByCode } from "../providers/registry"; // Получение провайдера по коду.
import { resolveProviderCode } from "../providers/resolveProviderCode"; // Логика выбора провайдера.
import {
  generateMerchantOrderId,
  normalizeMerchantOrderId,
} from "../core/merchantOrderId";

// Тип входных данных для создания платежа.
type CreatePaymentInput = {
  apiKey: string; // API-ключ мерчанта.
  amount: number; // Сумма платежа.
  currency: string; // Валюта.
  cardNumber: string; // Номер карты.
  expMonth: number; // Месяц истечения.
  expYear: number; // Год истечения.
  cvv: string; // CVV.
  providerCode?: string; // Необязательный провайдер из запроса.
  merchantOrderId?: string; // Внешний id заказа у мерчанта.
};

// Тип результата создания платежа.
type CreatePaymentResult = {
  payment: unknown; // Сам платёж из Prisma.
  card: {
    brand: string; // Бренд карты.
    last4: string; // Последние 4 цифры.
    expMonth: number; // Месяц.
    expYear: number; // Год.
  };
  selectedProviderCode: string; // Какой провайдер был выбран.
};

// Сервис создания платежа.
export async function createPaymentInit(
  prisma: PrismaClient, // Prisma-клиент.
  input: CreatePaymentInput, // Входные данные.
  cardKey: Buffer, // Ключ для шифрования PAN.
): Promise<CreatePaymentResult> {
  // Достаём поля из входных данных.
  const {
    apiKey, // API-ключ мерчанта.
    amount, // Сумма.
    currency, // Валюта.
    cardNumber, // Номер карты.
    expMonth, // Месяц истечения.
    expYear, // Год истечения.
    cvv, // CVV.
    providerCode, // Необязательный провайдер.
    merchantOrderId, // Необязательный внешний id заказа.
  } = input;

  // Сначала определяем итоговый код провайдера.
  const resolvedProviderCode = resolveProviderCode(
    Number(amount), // Сумма как число.
    providerCode as "mock_bank" | "fake_bank" | undefined, // Если провайдер передали явно.
  );

  // Получаем выбранного провайдера.
  const selectedProvider = getProviderByCode(resolvedProviderCode);

  // Проверяем сумму.
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw AppError.validationInvalidField(
      "body",
      "amount",
      "Сумма должна быть положительным числом",
      amount,
    );
  }

  // Проверяем валюту.
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    throw AppError.validationInvalidField(
      "body",
      "currency",
      "Валюта должна быть строкой из 3 заглавных букв (ISO 4217)",
      currency,
    );
  }

  // Подготавливаем PAN.
  const panRaw = String(cardNumber ?? ""); // Сырой номер карты.
  const panClean = panRaw.replace(/\s+/g, ""); // Убираем пробелы.
  const maskedPan = maskPanForError(panRaw); // Маскируем для ошибок.

  // Проверяем формат PAN.
  if (!/^\d{12,19}$/.test(panClean)) {
    throw AppError.validationInvalidField(
      "body",
      "cardNumber",
      "Номер карты в неверном формате (только цифры, длина 12–19)",
      maskedPan,
    );
  }

  // Готовим данные карты.
  const pan = panClean; // Чистый PAN.
  const bin = pan.slice(0, 6); // BIN.
  const last4 = pan.slice(-4); // Последние 4.

  // Проверяем месяц.
  const expMonthNum = Number(expMonth); // Превращаем в число.
  if (!Number.isInteger(expMonthNum) || expMonthNum < 1 || expMonthNum > 12) {
    throw AppError.validationInvalidField(
      "body",
      "expMonth",
      "Месяц истечения карты должен быть от 1 до 12",
      "XX",
    );
  }

  // Проверяем год.
  const expYearNum = Number(expYear); // Превращаем в число.
  const currentYear = new Date().getFullYear(); // Текущий год.

  if (!Number.isInteger(expYearNum) || expYearNum < currentYear) {
    throw AppError.validationInvalidField(
      "body",
      "expYear",
      "Год истечения карты не может быть в прошлом",
      "XXXX",
    );
  }

  if (expYearNum > currentYear + 20) {
    throw AppError.validationInvalidField(
      "body",
      "expYear",
      "Год истечения карты слишном далекий в будущем",
      "XXXX",
    );
  }

  // Проверяем CVV.
  const cvvStr = String(cvv ?? ""); // CVV как строка.

  if (!/^\d{3,4}$/.test(cvvStr)) {
    throw AppError.validationInvalidField(
      "body",
      "cvv",
      "CVV должен содержать 3-4 цирфы",
      cvvStr.length === 4 ? "XXXX" : "XXX",
    );
  }

  // Получаем мерчанта.
  const merchant = await getMerchantOrThrow(prisma, apiKey);
  const resolvedMerchantOrderId =
    normalizeMerchantOrderId(merchantOrderId) ||
    generateMerchantOrderId(`pay_${merchant.id.slice(-6)}`);

  // Определяем бренд карты.
  let brand = "UNKNOWN"; // По умолчанию UNKNOWN.
  if (pan.startsWith("4"))
    brand = "VISA"; // Если начинается на 4 — VISA.
  else if (pan[0] === "5") brand = "MASTERCARD"; // Если первая цифра 5 — MASTERCARD.

  // Шифруем PAN.
  const encryptedPan = encryptPan(pan, cardKey);

  // Создаём карту.
  const card = await prisma.card.create({
    data: {
      merchantId: merchant.id, // Привязка к мерчанту.
      bin, // BIN.
      last4, // Последние 4.
      brand, // Бренд.
      expMonth: expMonthNum, // Месяц.
      expYear: expYearNum, // Год.
      encryptedPan, // Шифрованный PAN.
    },
  });

  // Создаём платёж.
  const payment = await prisma.payment.create({
    data: {
      merchantId: merchant.id, // Кому принадлежит платёж.
      amount, // Сумма.
      currency, // Валюта.
      status: PAYMENT_STATUS.CREATED, // Начальный статус.
      method: "card", // Метод.
      direction: "in", // Направление.
      cardId: card.id, // Привязка карты.
      providerCode: selectedProvider.code, // Выбранный провайдер.
      merchantOrderId: resolvedMerchantOrderId, // Внешний id заказа.
    },
  });

  // Пишем событие создания платежа.
  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id, // К какому платежу относится событие.
      type: "created", // Тип события.
      status: PAYMENT_STATUS.CREATED, // Статус события.
      payload: {
        note: "Платеж успешно создан", // Пояснение.
        cardLast4: card.last4, // Последние 4 цифры карты.
        currency, // Валюта.
        amount, // Сумма.
        merchantOrderId: resolvedMerchantOrderId, // Внешний id заказа.
      },
    },
  });

  // Возвращаем результат.
  return {
    payment, // Сам платёж.
    card: {
      brand, // Бренд карты.
      last4, // Последние 4.
      expMonth: expMonthNum, // Месяц.
      expYear: expYearNum, // Год.
    },
    selectedProviderCode: selectedProvider.code, // Какой провайдер выбрали.
  };
}
