
import { PrismaClient } from "@prisma/client";
import { PaymentProvider } from "./types";
import { startProcessing, sendToMockUpsstream } from "../upstream/mockBank";

import { Request, Response } from "express";

import {
  handleMockBankPaymentResultWebhook,
  handleMockBankChargebackWebhook,
} from "../upstream/bankWebhooks";

//Это первый провайдер в системе.
// Теперь он умеет и process/retry, и webhook-обработку.

export const mockBankProvider: PaymentProvider = {
  //Код провайдера
  code: "mock_bank",

  //Запуск обычной обработки платежа
  async startProcessing(prisma: PrismaClient, paymentId: string) {
    // Используем твою уже существующую функцию.
    await startProcessing(prisma, paymentId);
  },

  async retryProcessing(prisma: PrismaClient, paymentId: string) {
    // Используем твою уже существующую функцию повторной отправки.
    await sendToMockUpsstream(prisma, paymentId);
  },

  //Обработка webhhook с резульаттом платежа
  async handlePaymentResultWebhook(
    prisma: PrismaClient,
    req: Request,
    res: Response,
  ) {
    await handleMockBankPaymentResultWebhook(prisma, req, res);
  },

  // Обработка webhook-а chargeback.
  async handleChargebackWebhook(
    prisma: PrismaClient,
    req: Request,
    res: Response,
  ) {
    await handleMockBankChargebackWebhook(prisma, req, res);
  },
};
