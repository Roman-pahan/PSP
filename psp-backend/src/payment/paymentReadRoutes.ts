import express from "express";
import { PrismaClient } from "@prisma/client";
import { sendError } from "../core/httpError";
import { AppError } from "../core/errors";
import { requireFields } from "../core/requestValidation";
import {
  getMerchantOrThrow,
  getPaymentOrThrow,
  getPaymentForMerchantOrThrow,
} from "../core/domain";

export function createPaymentReadRouter(prisma: PrismaClient) {
  const router = express.Router();

  router.get("/payment/status", async (req, res) => {
    try {
      requireFields("query", req.query, ["paymentId"]);

      const rawPaymentId = req.query.paymentId;
      const paymentId =
        typeof rawPaymentId === "string" ? rawPaymentId.trim() : "";

      if (!paymentId) {
        throw AppError.validationInvalidField(
          "query",
          "paymentId",
          "Идентификатор платежа не может быть пустым",
          "EMPTY",
        );
      }

      const payment = await getPaymentOrThrow(prisma, paymentId);

      return res.json({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        merchantId: payment.merchantId,
        merchantOrderId: payment.merchantOrderId,
        providerCode: payment.providerCode,
        upstreamId: payment.upstreamId,
        upstreamStatus: payment.upstreamStatus,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
    } catch (err) {
      console.error("Ошибка в статуса:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/events", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      const { apiKey, paymentId } = req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      const events = await prisma.paymentEvent.findMany({
        where: {
          paymentId: payment.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return res.json({
        paymentId: payment.id,
        status: payment.status,
        providerCode: payment.providerCode,
        upstreamId: payment.upstreamId,
        upstreamStatus: payment.upstreamStatus,
        events: events,
      });
    } catch (err) {
      console.error("Ошибка получания истории платежа:", err);
      return sendError(res, err);
    }
  });

  router.post("/payments/list", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey"]);

      const { apiKey, limit, page, status, providerCode, search, sortBy, sortOrder } =
        req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const take = Number(limit) > 0 ? Number(limit) : 20;

      const rawPage = Number(page);
      const pageNumber = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

      const skip = (pageNumber - 1) * take;

      const where = {
        merchantId: merchant.id,
        ...(status ? { status } : {}),
        ...(providerCode ? { providerCode } : {}),
        ...(search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" as const } },
                {
                  merchantOrderId: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                { upstreamId: { contains: search, mode: "insensitive" as const } },
                {
                  upstreamStatus: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  providerCode: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                { status: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const allowedSortBy = new Set([
        "createdAt",
        "updatedAt",
        "amount",
        "status",
        "providerCode",
      ]);
      const resolvedSortBy = allowedSortBy.has(String(sortBy || ""))
        ? String(sortBy)
        : "createdAt";
      const resolvedSortOrder = String(sortOrder || "").toLowerCase() === "asc"
        ? "asc"
        : "desc";

      const totalCount = await prisma.payment.count({
        where: where,
      });

      const totalPages = Math.max(1, Math.ceil(totalCount / take));

      const payments = await prisma.payment.findMany({
        where: where,
        orderBy: {
          [resolvedSortBy]: resolvedSortOrder,
        },
        skip: skip,
        take: take,
      });

      return res.json({
        merchantId: merchant.id,
        count: payments.length,
        totalCount: totalCount,
        page: pageNumber,
        totalPages: totalPages,
        filters: {
          status: status || null,
          providerCode: providerCode || null,
          search: search || null,
          sortBy: resolvedSortBy,
          sortOrder: resolvedSortOrder,
          limit: take,
        },
        items: payments.map((payment) => ({
          id: payment.id,
          merchantOrderId: payment.merchantOrderId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          providerCode: payment.providerCode,
          upstreamId: payment.upstreamId,
          upstreamStatus: payment.upstreamStatus,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
      });
    } catch (err) {
      console.error("Ошибка получения списка платежей:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/details", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey", "paymentId"]);

      const { apiKey, paymentId } = req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      const card = payment.cardId
        ? await prisma.card.findUnique({
            where: {
              id: payment.cardId,
            },
          })
        : null;

      const events = await prisma.paymentEvent.findMany({
        where: {
          paymentId: payment.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return res.json({
        payment: {
          id: payment.id,
          merchantId: payment.merchantId,
          merchantOrderId: payment.merchantOrderId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          direction: payment.direction,
          providerCode: payment.providerCode,
          upstreamId: payment.upstreamId,
          upstreamStatus: payment.upstreamStatus,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        },
        card: card
          ? {
              id: card.id,
              bin: card.bin,
              last4: card.last4,
              brand: card.brand,
              expMonth: card.expMonth,
              expYear: card.expYear,
            }
          : null,
        events: events,
      });
    } catch (err) {
      console.error("Ошибка получения деталей платежа:", err);
      return sendError(res, err);
    }
  });

  router.post("/payments/summary", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey"]);

      const { apiKey } = req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const payments = await prisma.payment.findMany({
        where: {
          merchantId: merchant.id,
        },
        select: {
          status: true,
          providerCode: true,
          amount: true,
          currency: true,
        },
      });

      const summary = {
        totalCount: payments.length,
        byStatus: {} as Record<string, number>,
        byProvider: {} as Record<string, number>,
      };

      for (const payment of payments) {
        const statusKey = payment.status || "unknown";
        summary.byStatus[statusKey] = (summary.byStatus[statusKey] || 0) + 1;

        const providerKey = payment.providerCode || "unknown";
        summary.byProvider[providerKey] =
          (summary.byProvider[providerKey] || 0) + 1;
      }

      return res.json({
        merchantId: merchant.id,
        summary,
      });
    } catch (err) {
      console.error("Ошибка получения summary платежей:", err);
      return sendError(res, err);
    }
  });

  router.post("/dashboard/overview", async (req, res) => {
    try {
      requireFields("body", req.body, ["apiKey"]);

      const { apiKey, limit } = req.body;

      const merchant = await getMerchantOrThrow(prisma, apiKey);

      const rawTake = Number(limit);
      const take =
        Number.isInteger(rawTake) && rawTake > 0 ? Math.min(rawTake, 50) : 10;

      const payments = await prisma.payment.findMany({
        where: {
          merchantId: merchant.id,
        },
        select: {
          status: true,
          providerCode: true,
        },
      });

      const summary = {
        totalCount: payments.length,
        byStatus: {} as Record<string, number>,
        byProvider: {} as Record<string, number>,
      };

      for (const payment of payments) {
        const statusKey = payment.status || "unknown";
        summary.byStatus[statusKey] = (summary.byStatus[statusKey] || 0) + 1;

        const providerKey = payment.providerCode || "unknown";
        summary.byProvider[providerKey] =
          (summary.byProvider[providerKey] || 0) + 1;
      }

      const recentPayments = await prisma.payment.findMany({
        where: {
          merchantId: merchant.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: take,
      });

      return res.json({
        merchantId: merchant.id,
        summary: summary,
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          providerCode: payment.providerCode,
          upstreamId: payment.upstreamId,
          upstreamStatus: payment.upstreamStatus,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
      });
    } catch (err) {
      console.error("Ошибка получения dashboard overview:", err);
      return sendError(res, err);
    }
  });

  return router;
}
