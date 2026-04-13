import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { PaymentProvider } from "./types";
import { PAYMENT_STATUS } from "../core/statuses";

export const fakeBankProvider: PaymentProvider = {
  code: "fake_bank",

  async startProcessing(prisma: PrismaClient, paymentId: string) {
    const upstreamId = `FBK_${paymentId.slice(-6)}`;

    await prisma.paymentEvent.create({
      data: {
        paymentId: paymentId,
        type: "request",
        status: PAYMENT_STATUS.PROCESSING,
        payload: {
          note: "Платёж отправлен в fake_bank",
          providerCode: "fake_bank",
        },
      },
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PAYMENT_STATUS.DECLINED,
        upstreamId: upstreamId,
        upstreamStatus: "declined",
      },
    });

    await prisma.paymentEvent.create({
      data: {
        paymentId: paymentId,
        type: "response",
        status: PAYMENT_STATUS.DECLINED,
        payload: {
          note: "Ответ fake_bank",
          providerCode: "fake_bank",
          upstreamId: upstreamId,
          upstreamStatus: "declined",
        },
      },
    });
  },

  async retryProcessing(prisma: PrismaClient, paymentId: string) {
    await fakeBankProvider.startProcessing(prisma, paymentId);
  },

  async handlePaymentResultWebhook(
    _prisma: PrismaClient,
    _req: Request,
    res: Response,
  ) {
    res.status(501).json({
      ok: false,
      message: "Webhook payment-result для fake_bank пока не реализован",
    });
  },

  async handleChargebackWebhook(
    _prisma: PrismaClient,
    _req: Request,
    res: Response,
  ) {
    res.status(501).json({
      ok: false,
      message: "Webhook chargeback для fake_bank пока не реализован",
    });
  },
};
