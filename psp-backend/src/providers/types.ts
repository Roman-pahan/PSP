import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

//Это код провайдера.
// Пока у нас только один провайдер.
export type ProviderCode = "mock_bank" | "fake_bank";

//Это общий интерфейс любого платежного провайдера.
//Потом сюда можно будет добавить еще методы
export interface PaymentProvider {
  //у каждого провайдера есть своей код.
  code: ProviderCode;

  //Провайдер должен усеть запустить обработку платежа
  startProcessing(prisma: PrismaClient, paymentId: string): Promise<void>;

  //Провайдер должен уметь повторно отправить платеж
  retryProcessing(prisma: PrismaClient, paymentId: string): Promise<void>;

  handlePaymentResultWebhook(
    prisma: PrismaClient,
    req: Request,
    res: Response,
  ): Promise<void>;

  handleChargebackWebhook(
    prisma: PrismaClient,
    req: Request,
    res: Response,
  ): Promise<void>;
}
