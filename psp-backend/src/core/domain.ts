import { PrismaClient } from "@prisma/client";
import { AppError } from "./errors";

export async function getMerchantOrThrow(prisma: PrismaClient, apiKey: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { apiKey },
  });

  if (!merchant) {
    throw AppError.merchantNotFound(apiKey);
  }

  return merchant;
}

export async function getPaymentOrThrow(
  prisma: PrismaClient,
  paymentId: string
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw AppError.paymentNotFound(paymentId);
  }

  return payment;
}

export async function getPaymentForMerchantOrThrow(
  prisma: PrismaClient,
  paymentId: string,
  merchantId: string
) {
  const payment = await getPaymentOrThrow(prisma, paymentId);

  if (payment.merchantId !== merchantId) {
    throw AppError.forbiddenPaymentAccess(payment.id, merchantId);
  }
  return payment;
}
