import { PrismaClient } from "@prisma/client";
import { encryptPan } from "../core/cardCrypto";
import { getPaymentOrThrow } from "../core/domain";
import { AppError } from "../core/errors";
import { maskPanForError } from "../core/requestValidation";
import { PAYMENT_STATUS } from "../core/statuses";
import { getProviderByCode } from "../providers/registry";
import { resolveProviderCode } from "../providers/resolveProviderCode";
import {
  generateMerchantOrderId,
  normalizeMerchantOrderId,
} from "../core/merchantOrderId";

type ProcessMode = "auto" | "manual";

type SubmitCheckoutPaymentInput = {
  sessionId: string;
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  providerCode?: "mock_bank" | "fake_bank";
};

export function buildCheckoutSessionId(paymentId: string) {
  return `sess_${paymentId}`;
}

export function extractPaymentIdFromSessionId(sessionId: string) {
  const normalized = String(sessionId || "").trim();

  if (!normalized.startsWith("sess_") || normalized.length <= 5) {
    throw AppError.validationInvalidField(
      "params",
      "sessionId",
      "Некорректный checkout session id",
      "INVALID_SESSION",
    );
  }

  return normalized.slice(5);
}

function ensureValidCurrency(currency: unknown) {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
    throw AppError.validationError(
      "Валюта должна быть строкой из 3 заглавных букв",
      {
        field: "currency",
        value: currency,
      },
    );
  }
}

function ensureValidUrl(field: "returnUrl" | "cancelUrl", value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw AppError.validationInvalidField(
      "body",
      field,
      "URL не может быть пустым",
      "EMPTY_URL",
    );
  }

  try {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw AppError.validationInvalidField(
      "body",
      field,
      "Некорректный URL",
      "INVALID_URL",
    );
  }
}

function parseCardBrand(pan: string) {
  if (pan.startsWith("4")) {
    return "VISA";
  }

  if (pan.startsWith("5")) {
    return "MASTERCARD";
  }

  return "UNKNOWN";
}

function validateCardInput(input: SubmitCheckoutPaymentInput) {
  const panRaw = String(input.cardNumber ?? "");
  const panClean = panRaw.replace(/\s+/g, "");
  const maskedPan = maskPanForError(panRaw);

  if (!/^\d{12,19}$/.test(panClean)) {
    throw AppError.validationInvalidField(
      "body",
      "cardNumber",
      "Номер карты в неверном формате (только цифры, длина 12-19)",
      maskedPan,
    );
  }

  const expMonthNum = Number(input.expMonth);
  if (!Number.isInteger(expMonthNum) || expMonthNum < 1 || expMonthNum > 12) {
    throw AppError.validationInvalidField(
      "body",
      "expMonth",
      "Месяц истечения карты должен быть от 1 до 12",
      "XX",
    );
  }

  const expYearNum = Number(input.expYear);
  const currentYear = new Date().getFullYear();
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
      "Год истечения карты слишком далеко в будущем",
      "XXXX",
    );
  }

  const cvvStr = String(input.cvv ?? "");
  if (!/^\d{3,4}$/.test(cvvStr)) {
    throw AppError.validationInvalidField(
      "body",
      "cvv",
      "CVV должен содержать 3-4 цифры",
      cvvStr.length === 4 ? "XXXX" : "XXX",
    );
  }

  return {
    pan: panClean,
    expMonth: expMonthNum,
    expYear: expYearNum,
  };
}

export async function createCheckoutSession(
  prisma: PrismaClient,
  input: {
    merchantId: string;
    amount: number;
    currency: string;
    merchantOrderId?: string;
    returnUrl: string;
    cancelUrl: string;
  },
) {
  const { merchantId, amount, currency, merchantOrderId, returnUrl, cancelUrl } =
    input;
  const resolvedMerchantOrderId =
    normalizeMerchantOrderId(merchantOrderId) ||
    generateMerchantOrderId(`chk_${merchantId.slice(-6)}`);

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw AppError.validationError("Сумма должна быть положительным числом", {
      field: "amount",
      value: amount,
    });
  }

  ensureValidCurrency(currency);
  ensureValidUrl("returnUrl", returnUrl);
  ensureValidUrl("cancelUrl", cancelUrl);

  const payment = await prisma.payment.create({
    data: {
      merchantId,
      amount,
      currency,
      status: PAYMENT_STATUS.CREATED,
      method: "card",
      direction: "in",
      providerCode: "checkout_session",
      merchantOrderId: resolvedMerchantOrderId,
    },
  });

  const sessionId = buildCheckoutSessionId(payment.id);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "checkout_session_created",
      status: PAYMENT_STATUS.CREATED,
      payload: {
        sessionId,
        merchantOrderId: resolvedMerchantOrderId,
        returnUrl,
        cancelUrl,
        expiresAt: expiresAt.toISOString(),
        note: "Создана публичная checkout session",
      },
    },
  });

  return {
    payment,
    sessionId,
    expiresAt,
  };
}

export async function getCheckoutSessionDetails(
  prisma: PrismaClient,
  sessionId: string,
) {
  const paymentId = extractPaymentIdFromSessionId(sessionId);
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      merchant: true,
    },
  });

  if (!payment) {
    throw AppError.paymentNotFound(paymentId);
  }

  const sessionEvent = await prisma.paymentEvent.findFirst({
    where: {
      paymentId,
      type: "checkout_session_created",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const payload =
    sessionEvent && typeof sessionEvent.payload === "object" && sessionEvent.payload
      ? (sessionEvent.payload as Record<string, unknown>)
      : {};

  return {
    sessionId,
    payment: {
      id: payment.id,
      merchantId: payment.merchantId,
      merchantName: payment.merchant?.name || "Merchant",
      merchantOrderId: payment.merchantOrderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      providerCode: payment.providerCode,
      upstreamId: payment.upstreamId,
      upstreamStatus: payment.upstreamStatus,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    },
    session: {
      merchantOrderId: String(
        payment.merchantOrderId || payload.merchantOrderId || "",
      ),
      returnUrl: String(payload.returnUrl || ""),
      cancelUrl: String(payload.cancelUrl || ""),
      expiresAt: String(payload.expiresAt || ""),
    },
  };
}

export async function submitCheckoutPayment(
  prisma: PrismaClient,
  input: SubmitCheckoutPaymentInput,
  cardKey: Buffer,
  processMode: ProcessMode,
) {
  const paymentId = extractPaymentIdFromSessionId(input.sessionId);
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.status !== PAYMENT_STATUS.CREATED) {
    throw AppError.statusTransitionNotAllowed({
      from: payment.status,
      action: "checkout_pay",
      allowedFrom: [PAYMENT_STATUS.CREATED],
      reason: "Публичную checkout-оплату можно отправить только из created",
    });
  }

  const sessionDetails = await getCheckoutSessionDetails(prisma, input.sessionId);
  const expiresAtRaw = sessionDetails.session.expiresAt;
  if (expiresAtRaw) {
    const expiresAt = new Date(expiresAtRaw);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      throw AppError.validationError("Checkout session истекла", {
        field: "sessionId",
        value: input.sessionId,
      });
    }
  }

  const card = validateCardInput(input);
  const providerCode = resolveProviderCode(
    Number(payment.amount),
    input.providerCode,
  );
  const provider = getProviderByCode(providerCode);

  const createdCard = await prisma.card.create({
    data: {
      merchantId: payment.merchantId,
      bin: card.pan.slice(0, 6),
      last4: card.pan.slice(-4),
      brand: parseCardBrand(card.pan),
      expMonth: card.expMonth,
      expYear: card.expYear,
      encryptedPan: encryptPan(card.pan, cardKey),
    },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      cardId: createdCard.id,
      providerCode: provider.code,
      upstreamId: null,
      upstreamStatus: null,
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "checkout_card_submitted",
      status: PAYMENT_STATUS.CREATED,
      payload: {
        note: "Клиент отправил карту в sandbox checkout",
        providerCode: provider.code,
        cardLast4: createdCard.last4,
        brand: createdCard.brand,
      },
    },
  });

  if (processMode === "auto") {
    await provider.startProcessing(prisma, payment.id);
  }

  return getCheckoutSessionDetails(prisma, input.sessionId);
}
