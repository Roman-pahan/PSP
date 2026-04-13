import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { sendError } from "../core/httpError";
import { AppError } from "../core/errors";
import { requireFields } from "../core/requestValidation";
import { getPaymentForMerchantOrThrow, getPaymentOrThrow } from "../core/domain";
import { statusRules } from "../core/asserts";
import { PAYMENT_STATUS, PaymentStatus } from "../core/statuses";
import {
  capturePayment,
  cancelPayment,
  refundPayment,
  retryPayment,
  applyChargeback,
} from "../core/transitions";
import { getProviderByCode } from "../providers/registry";
import { createPaymentInit } from "../payment/paymentInitService";
import { createCheckoutSession } from "../checkout/checkoutService";
import {
  createMerchantPortalToken,
  extractMerchantPortalTokenFromRequest,
  MERCHANT_PORTAL_COOKIE_NAME,
  hashPortalPassword,
  normalizeMerchantEmail,
  validateMerchantPassword,
  verifyMerchantPortalToken,
  verifyPortalPassword,
} from "./merchantPortalAuth";
import { clearSessionCookie, setSessionCookie } from "../core/sessionCookies";
import { writeAuditLog } from "../core/auditLog";
import {
  generateTotpProvisioningUri,
  generateTotpSecret,
  getTotpIssuer,
  verifyTotpCode,
} from "../admin/totp";

async function getMerchantFromPortalToken(
  prisma: PrismaClient,
  req: any,
) {
  const merchantRepo = prisma.merchant as any;
  const merchantUserRepo = (prisma as any).merchantUser;
  const token = extractMerchantPortalTokenFromRequest(req);
  const payload = verifyMerchantPortalToken(token);

  if (payload.userId) {
    const merchantUser = await merchantUserRepo.findUnique({
      where: {
        id: payload.userId,
      },
    });

    if (
      !merchantUser ||
      !merchantUser.isActive ||
      merchantUser.merchantId !== payload.merchantId ||
      merchantUser.email !== payload.email
    ) {
      throw AppError.invalidPortalToken();
    }

    const merchant = await merchantRepo.findUnique({
      where: {
        id: payload.merchantId,
      },
    });

    if (!merchant) {
      throw AppError.invalidPortalToken();
    }

    return {
      merchant,
      currentUser: {
        id: merchantUser.id,
        email: merchantUser.email,
        role: merchantUser.role || "manager",
        isLegacyOwner: false,
        passwordHash: merchantUser.passwordHash,
        twoFactorSecret: merchantUser.twoFactorSecret || null,
        twoFactorEnabled: Boolean(merchantUser.twoFactorEnabled),
      },
    };
  }

  const merchant = await merchantRepo.findUnique({
    where: {
      id: payload.merchantId,
    },
  });

  if (!merchant || !merchant.email || merchant.email !== payload.email) {
    throw AppError.invalidPortalToken();
  }

  return {
    merchant,
    currentUser: {
      id: merchant.id,
      email: merchant.email,
      role: "owner",
      isLegacyOwner: true,
      passwordHash: merchant.passwordHash || null,
      twoFactorSecret: merchant.twoFactorSecret || null,
      twoFactorEnabled: Boolean(merchant.twoFactorEnabled),
    },
  };
}

function getMerchantPortalPermissions(role: string) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  return {
    canManageMerchantProfile: normalizedRole === "owner",
    canRotateApiKey: normalizedRole === "owner",
    canManageMerchantUsers: normalizedRole === "owner",
    canViewMerchantAudit: normalizedRole === "owner",
    canViewPayments: ["owner", "manager", "readonly"].includes(normalizedRole),
    canManagePayments: ["owner", "manager"].includes(normalizedRole),
  };
}

function ensureMerchantPortalPermission(currentUser: any, permission: string, action: string) {
  const permissions = getMerchantPortalPermissions(currentUser?.role);

  if (!(permissions as Record<string, boolean>)[permission]) {
    throw AppError.forbiddenAdminAction(action, currentUser?.role || "merchant_user");
  }
}

function buildMerchantPortalProfile(merchant: any, currentUser?: any) {
  return {
    id: merchant.id,
    name: merchant.name,
    email: merchant.email || null,
    currentUser: currentUser
      ? {
          id: currentUser.id,
          email: currentUser.email,
          role: currentUser.role,
          permissions: getMerchantPortalPermissions(currentUser.role),
          isLegacyOwner: Boolean(currentUser.isLegacyOwner),
          twoFactorEnabled: Boolean(currentUser.twoFactorEnabled),
        }
      : null,
    apiKeyMasked: `${merchant.apiKey.slice(0, 6)}...${merchant.apiKey.slice(-4)}`,
    createdAt: merchant.createdAt,
    updatedAt: merchant.updatedAt,
  };
}

function buildMerchantAuditPayload(
  merchant: any,
  currentUser: any,
  extra: Record<string, unknown> = {},
) {
  return {
    actorRole: currentUser?.role || "owner",
    actorEmail: currentUser?.email || merchant?.email || null,
    merchantEmail: merchant?.email || null,
    merchantId: merchant?.id || null,
    ...extra,
  };
}

async function updateMerchantCurrentUserSecurity(
  prisma: PrismaClient,
  currentUser: any,
  data: Record<string, unknown>,
) {
  if (currentUser?.isLegacyOwner) {
    return (prisma.merchant as any).update({
      where: { id: currentUser.id },
      data,
    });
  }

  return (prisma as any).merchantUser.update({
    where: { id: currentUser.id },
    data,
  });
}

function verifyMerchantStepUp(currentUser: any, password: string, code: string) {
  if (!currentUser?.passwordHash || !verifyPortalPassword(password, currentUser.passwordHash)) {
    throw AppError.invalidPortalPasswordConfirmation();
  }

  if (!currentUser.twoFactorEnabled || !currentUser.twoFactorSecret) {
    throw AppError.validationError("Сначала включи 2FA в кабинете мерчанта");
  }

  if (!verifyTotpCode(currentUser.twoFactorSecret, code)) {
    throw AppError.invalidTwoFactorCode();
  }
}

function buildPaymentsSummary(
  payments: Array<{
    status?: string | null;
    providerCode?: string | null;
  }>,
) {
  const summary = {
    totalCount: payments.length,
    byStatus: {} as Record<string, number>,
    byProvider: {} as Record<string, number>,
  };

  for (const payment of payments) {
    const statusKey = payment.status || "unknown";
    summary.byStatus[statusKey] = (summary.byStatus[statusKey] || 0) + 1;

    const providerKey = payment.providerCode || "unknown";
    summary.byProvider[providerKey] = (summary.byProvider[providerKey] || 0) + 1;
  }

  return summary;
}

export function createMerchantPortalRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/bootstrap-status", async (_req, res) => {
    try {
      const merchantRepo = prisma.merchant as any;
      const merchantsCount = await merchantRepo.count();

      return res.json({
        ok: true,
        canSelfRegister: merchantsCount === 0,
        merchantsCount,
      });
    } catch (err) {
      console.error("Ошибка bootstrap status кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/register", async (req, res) => {
    try {
      const merchantRepo = prisma.merchant as any;
      const merchantsCount = await merchantRepo.count();
      requireFields("body", req.body, ["name", "email", "password"]);

      if (merchantsCount > 0) {
        throw AppError.validationError(
          "Публичная регистрация мерчанта закрыта. Новых мерчантов должен создавать PSP admin",
        );
      }

      const name = String(req.body.name || "").trim();
      const email = normalizeMerchantEmail(req.body.email);
      const password = String(req.body.password || "");

      if (!name) {
        throw AppError.validationInvalidField(
          "body",
          "name",
          "Название мерчанта не может быть пустым",
          "EMPTY",
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Некорректный email мерчанта",
          email || "EMPTY",
        );
      }

      validateMerchantPassword(password);

      const existingMerchant = await merchantRepo.findUnique({
        where: { email },
      });

      if (existingMerchant) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Мерчант с таким email уже существует",
          email,
        );
      }

      const merchant = await merchantRepo.create({
        data: {
          name,
          email,
          passwordHash: hashPortalPassword(password),
          apiKey: "mch_" + crypto.randomBytes(16).toString("hex"),
        },
      });

      const token = createMerchantPortalToken({
        merchantId: merchant.id,
        email,
        userId: null,
        role: "owner",
      });
      setSessionCookie(res, MERCHANT_PORTAL_COOKIE_NAME, token);
      await writeAuditLog(prisma, {
        actorType: "merchant_bootstrap",
        actorId: merchant.id,
        action: "merchant_portal_registered",
        entityType: "merchant",
        entityId: merchant.id,
        payload: {
          actorRole: "owner",
          actorEmail: merchant.email || null,
          merchantEmail: merchant.email || null,
          merchantId: merchant.id,
        },
      });

      return res.json({
        ok: true,
        token,
        merchant: buildMerchantPortalProfile(merchant, {
          id: merchant.id,
          email,
          role: "owner",
          isLegacyOwner: true,
        }),
      });
    } catch (err) {
      console.error("Ошибка регистрации мерчанта в кабинете:", err);
      return sendError(res, err);
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const merchantRepo = prisma.merchant as any;
      requireFields("body", req.body, ["email", "password"]);

      const email = normalizeMerchantEmail(req.body.email);
      const password = String(req.body.password || "");
      const twoFactorCode = String(req.body.twoFactorCode || "");
      const merchantUserRepo = (prisma as any).merchantUser;
      const merchantUser = await merchantUserRepo.findUnique({
        where: { email },
      });

      if (
        merchantUser &&
        merchantUser.passwordHash &&
        merchantUser.isActive &&
        verifyPortalPassword(password, merchantUser.passwordHash)
      ) {
        const merchant = await merchantRepo.findUnique({
          where: { id: merchantUser.merchantId },
        });

        if (!merchant) {
          throw AppError.invalidPortalCredentials();
        }

        if (merchantUser.twoFactorEnabled) {
          if (!twoFactorCode.trim()) {
            throw AppError.twoFactorRequired();
          }

          if (
            !merchantUser.twoFactorSecret ||
            !verifyTotpCode(merchantUser.twoFactorSecret, twoFactorCode)
          ) {
            throw AppError.invalidTwoFactorCode();
          }
        }

        const token = createMerchantPortalToken({
          merchantId: merchant.id,
          email,
          userId: merchantUser.id,
          role: merchantUser.role || "manager",
        });
        setSessionCookie(res, MERCHANT_PORTAL_COOKIE_NAME, token);
        await writeAuditLog(prisma, {
          actorType: "merchant_user",
          actorId: merchantUser.id,
          action: "merchant_user_logged_in",
          entityType: "merchant",
          entityId: merchant.id,
          payload: buildMerchantAuditPayload(merchant, {
            id: merchantUser.id,
            email: merchantUser.email,
            role: merchantUser.role || "manager",
          }, {
            userEmail: merchantUser.email,
            userRole: merchantUser.role || "manager",
          }),
        });

        return res.json({
          ok: true,
          token,
          merchant: buildMerchantPortalProfile(merchant, {
            id: merchantUser.id,
            email: merchantUser.email,
            role: merchantUser.role || "manager",
            isLegacyOwner: false,
          }),
        });
      }

      const merchant = await merchantRepo.findUnique({
        where: { email },
      });

      if (
        !merchant ||
        !merchant.passwordHash ||
        !verifyPortalPassword(password, merchant.passwordHash)
      ) {
        throw AppError.invalidPortalCredentials();
      }

      if (merchant.twoFactorEnabled) {
        if (!twoFactorCode.trim()) {
          throw AppError.twoFactorRequired();
        }

        if (
          !merchant.twoFactorSecret ||
          !verifyTotpCode(merchant.twoFactorSecret, twoFactorCode)
        ) {
          throw AppError.invalidTwoFactorCode();
        }
      }

      const token = createMerchantPortalToken({
        merchantId: merchant.id,
        email,
        userId: null,
        role: "owner",
      });
      setSessionCookie(res, MERCHANT_PORTAL_COOKIE_NAME, token);
      await writeAuditLog(prisma, {
        actorType: "merchant_owner",
        actorId: merchant.id,
        action: "merchant_owner_logged_in",
        entityType: "merchant",
        entityId: merchant.id,
        payload: buildMerchantAuditPayload(merchant, {
          id: merchant.id,
          email,
          role: "owner",
        }),
      });

      return res.json({
        ok: true,
        token,
        merchant: buildMerchantPortalProfile(merchant, {
          id: merchant.id,
          email,
          role: "owner",
          isLegacyOwner: true,
        }),
      });
    } catch (err) {
      console.error("Ошибка входа мерчанта в кабинет:", err);
      return sendError(res, err);
    }
  });

  router.get("/me", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );

      return res.json({
        ok: true,
        merchant: buildMerchantPortalProfile(merchant, currentUser),
      });
    } catch (err) {
      console.error("Ошибка загрузки профиля мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/setup", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      const secret = generateTotpSecret();

      await updateMerchantCurrentUserSecurity(prisma, currentUser, {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
      });

      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_2fa_setup_started",
        entityType: currentUser.isLegacyOwner ? "merchant" : "merchant_user",
        entityId: currentUser.id,
        payload: buildMerchantAuditPayload(merchant, currentUser),
      });

      return res.json({
        ok: true,
        issuer: getTotpIssuer(),
        accountName: currentUser.email,
        secret,
        otpauthUrl: generateTotpProvisioningUri(currentUser.email, secret),
      });
    } catch (err) {
      console.error("Ошибка запуска setup 2FA мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/enable", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      if (!currentUser.passwordHash || !verifyPortalPassword(password, currentUser.passwordHash)) {
        throw AppError.invalidPortalPasswordConfirmation();
      }

      if (!currentUser.twoFactorSecret) {
        throw AppError.validationError("Сначала запусти настройку 2FA");
      }

      if (!verifyTotpCode(currentUser.twoFactorSecret, code)) {
        throw AppError.invalidTwoFactorCode();
      }

      const updatedRecord = await updateMerchantCurrentUserSecurity(prisma, currentUser, {
        twoFactorEnabled: true,
      });

      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_2fa_enabled",
        entityType: currentUser.isLegacyOwner ? "merchant" : "merchant_user",
        entityId: currentUser.id,
        payload: buildMerchantAuditPayload(merchant, currentUser),
      });

      const nextCurrentUser = {
        ...currentUser,
        twoFactorEnabled: true,
        twoFactorSecret: updatedRecord.twoFactorSecret || currentUser.twoFactorSecret,
      };

      return res.json({
        ok: true,
        merchant: buildMerchantPortalProfile(merchant, nextCurrentUser),
      });
    } catch (err) {
      console.error("Ошибка включения 2FA мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/disable", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      verifyMerchantStepUp(currentUser, password, code);

      await updateMerchantCurrentUserSecurity(prisma, currentUser, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_2fa_disabled",
        entityType: currentUser.isLegacyOwner ? "merchant" : "merchant_user",
        entityId: currentUser.id,
        payload: buildMerchantAuditPayload(merchant, currentUser),
      });

      return res.json({
        ok: true,
        merchant: buildMerchantPortalProfile(merchant, {
          ...currentUser,
          twoFactorEnabled: false,
          twoFactorSecret: null,
        }),
      });
    } catch (err) {
      console.error("Ошибка отключения 2FA мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.patch("/profile", async (req, res) => {
    try {
      const merchantRepo = prisma.merchant as any;
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManageMerchantProfile",
        "update_merchant_profile",
      );

      const nextName = String(req.body.name ?? merchant.name).trim();
      const nextEmail = normalizeMerchantEmail(req.body.email ?? merchant.email);

      if (!nextName) {
        throw AppError.validationInvalidField(
          "body",
          "name",
          "Название мерчанта не может быть пустым",
          "EMPTY",
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Некорректный email мерчанта",
          nextEmail || "EMPTY",
        );
      }

      const existingMerchantWithEmail = await merchantRepo.findUnique({
        where: { email: nextEmail },
      });

      if (
        existingMerchantWithEmail &&
        existingMerchantWithEmail.id !== merchant.id
      ) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Мерчант с таким email уже существует",
          nextEmail,
        );
      }

      const updatedMerchant = await merchantRepo.update({
        where: { id: merchant.id },
        data: {
          name: nextName,
          email: nextEmail,
        },
      });

      const token = createMerchantPortalToken({
        merchantId: updatedMerchant.id,
        email: nextEmail,
        userId: null,
        role: "owner",
      });
      setSessionCookie(res, MERCHANT_PORTAL_COOKIE_NAME, token);
      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: updatedMerchant.id,
        payload: buildMerchantAuditPayload(updatedMerchant, currentUser, {
          merchantEmail: nextEmail,
          merchantName: nextName,
        }),
      });

      return res.json({
        ok: true,
        token,
        merchant: buildMerchantPortalProfile(updatedMerchant, {
          id: updatedMerchant.id,
          email: nextEmail,
          role: "owner",
          isLegacyOwner: true,
        }),
      });
    } catch (err) {
      console.error("Ошибка обновления профиля мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/rotate-api-key", async (req, res) => {
    try {
      const merchantRepo = prisma.merchant as any;
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canRotateApiKey",
        "rotate_merchant_api_key",
      );
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      verifyMerchantStepUp(currentUser, password, code);

      const updatedMerchant = await merchantRepo.update({
        where: { id: merchant.id },
        data: {
          apiKey: "mch_" + crypto.randomBytes(16).toString("hex"),
        },
      });
      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_api_key_rotated",
        entityType: "merchant",
        entityId: merchant.id,
        payload: buildMerchantAuditPayload(merchant, currentUser, {
          stepUp: "password_and_totp",
        }),
      });

      return res.json({
        ok: true,
        merchant: buildMerchantPortalProfile(updatedMerchant, currentUser),
      });
    } catch (err) {
      console.error("Ошибка ротации apiKey мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/reveal-api-key", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canRotateApiKey",
        "reveal_merchant_api_key",
      );
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      verifyMerchantStepUp(currentUser, password, code);

      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_api_key_revealed",
        entityType: "merchant",
        entityId: merchant.id,
        payload: buildMerchantAuditPayload(merchant, currentUser, {
          stepUp: "password_and_totp",
        }),
      });

      return res.json({
        ok: true,
        apiKey: merchant.apiKey,
        merchant: buildMerchantPortalProfile(merchant, currentUser),
      });
    } catch (err) {
      console.error("Ошибка reveal apiKey мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.get("/overview", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canViewPayments", "view_overview");

      const payments = await prisma.payment.findMany({
        where: {
          merchantId: merchant.id,
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          providerCode: true,
          upstreamStatus: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      });

      const summary = buildPaymentsSummary(payments);

      return res.json({
        ok: true,
        merchant: buildMerchantPortalProfile(merchant, currentUser),
        summary,
        recentPayments: payments,
      });
    } catch (err) {
      console.error("Ошибка загрузки overview кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.get("/payments/summary", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canViewPayments",
        "view_payments_summary",
      );

      const payments = await prisma.payment.findMany({
        where: {
          merchantId: merchant.id,
        },
        select: {
          status: true,
          providerCode: true,
        },
      });

      return res.json({
        merchantId: merchant.id,
        summary: buildPaymentsSummary(payments),
      });
    } catch (err) {
      console.error("Ошибка загрузки summary кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.get("/payments/list", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canViewPayments", "list_payments");

      const rawLimit = Number(req.query.limit);
      const rawPage = Number(req.query.page);
      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;
      const providerCode =
        typeof req.query.providerCode === "string"
          ? req.query.providerCode
          : undefined;
      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : undefined;
      const sortByRaw =
        typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "createdAt";
      const sortOrderRaw =
        typeof req.query.sortOrder === "string"
          ? req.query.sortOrder.trim().toLowerCase()
          : "desc";

      const take = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20;
      const pageNumber =
        Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
      const skip = (pageNumber - 1) * take;
      const allowedSortBy = [
        "createdAt",
        "updatedAt",
        "amount",
        "status",
        "providerCode",
      ];
      const sortBy = allowedSortBy.includes(sortByRaw)
        ? sortByRaw
        : "createdAt";
      const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

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
                { upstreamStatus: { contains: search, mode: "insensitive" as const } },
                { providerCode: { contains: search, mode: "insensitive" as const } },
                { status: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const totalCount = await prisma.payment.count({ where });
      const totalPages = Math.max(1, Math.ceil(totalCount / take));
      const payments = await prisma.payment.findMany({
        where,
        orderBy: { [sortBy]: sortOrder } as any,
        skip,
        take,
      });

      return res.json({
        merchantId: merchant.id,
        count: payments.length,
        totalCount,
        page: pageNumber,
        totalPages,
        filters: {
          status: status || null,
          providerCode: providerCode || null,
          search: search || null,
          sortBy,
          sortOrder,
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
      console.error("Ошибка списка платежей кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.get("/payment/details/:paymentId", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canViewPayments",
        "view_payment_details",
      );
      requireFields("params", req.params, ["paymentId"]);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        String(req.params.paymentId),
        merchant.id,
      );

      const card = payment.cardId
        ? await prisma.card.findUnique({
            where: { id: payment.cardId },
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
        events,
      });
    } catch (err) {
      console.error("Ошибка деталей платежа кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/init", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canManagePayments", "init_payment");
      requireFields("body", req.body, [
        "amount",
        "currency",
        "cardNumber",
        "expMonth",
        "expYear",
        "cvv",
      ]);

      const result = await createPaymentInit(
        prisma,
        {
          ...req.body,
          apiKey: merchant.apiKey,
        },
        Buffer.from(process.env.CARD_ENC_KEY || "", "hex"),
      );

      return res.json({
        payment: result.payment,
        card: result.card,
      });
    } catch (err) {
      console.error("Ошибка создания платежа из кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/checkout/session", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManagePayments",
        "create_checkout_session",
      );
      requireFields("body", req.body, [
        "amount",
        "currency",
        "returnUrl",
        "cancelUrl",
      ]);

      const createdSession = await createCheckoutSession(prisma, {
        merchantId: merchant.id,
        amount: req.body.amount,
        currency: req.body.currency,
        merchantOrderId: req.body.merchantOrderId,
        returnUrl: req.body.returnUrl,
        cancelUrl: req.body.cancelUrl,
      });

      const checkoutBaseUrl =
        process.env.CHECKOUT_BASE_URL || "http://localhost:5173";
      const publicApiBaseUrl =
        process.env.PUBLIC_API_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`;

      const checkoutUrl =
        `${checkoutBaseUrl}` +
        `?page=public_checkout` +
        `&sessionId=${createdSession.sessionId}` +
        `&apiBase=${encodeURIComponent(publicApiBaseUrl)}`;

      return res.json({
        sessionId: createdSession.sessionId,
        paymentId: createdSession.payment.id,
        checkoutUrl,
        expiresAt: createdSession.expiresAt,
        providerCode: "sandbox_public_checkout",
      });
    } catch (err) {
      console.error("Ошибка checkout session кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/process", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManagePayments",
        "process_payment",
      );
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      const provider = getProviderByCode(payment.providerCode);
      await provider.startProcessing(prisma, paymentId);

      const updatedPayment = await getPaymentOrThrow(prisma, paymentId);

      return res.json({
        ok: true,
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        providerCode: updatedPayment.providerCode,
        upstreamId: updatedPayment.upstreamId,
        upstreamStatus: updatedPayment.upstreamStatus,
      });
    } catch (err) {
      console.error("Ошибка process кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/retry", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canManagePayments", "retry_payment");
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.retry.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "retry",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await retryPayment(prisma, paymentId);
      const provider = getProviderByCode(updated.providerCode);
      await provider.retryProcessing(prisma, paymentId);
      const updatedPayment = await getPaymentOrThrow(prisma, paymentId);

      return res.json({
        ok: true,
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        providerCode: updatedPayment.providerCode,
        upstreamId: updatedPayment.upstreamId,
        upstreamStatus: updatedPayment.upstreamStatus,
      });
    } catch (err) {
      console.error("Ошибка retry кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/capture", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManagePayments",
        "capture_payment",
      );
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.capture.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "capture",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await capturePayment(prisma, paymentId);

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка capture кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/refund", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canManagePayments", "refund_payment");
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.refund.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "refund",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await refundPayment(prisma, paymentId);

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка refund кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/cancel", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(currentUser, "canManagePayments", "cancel_payment");
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.cancel.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "cancel",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await cancelPayment(prisma, paymentId);

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка cancel кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/chargeback", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManagePayments",
        "chargeback_payment",
      );
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.chargeback.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "chargeback",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await applyChargeback(
        prisma,
        paymentId,
        "Симулированный чарджбэк из кабинета мерчанта",
      );

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка chargeback кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/simulate-chargeback", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(
        prisma,
        req,
      );
      ensureMerchantPortalPermission(
        currentUser,
        "canManagePayments",
        "simulate_chargeback_payment",
      );
      requireFields("body", req.body, ["paymentId"]);
      const paymentId = String(req.body.paymentId);

      const payment = await getPaymentForMerchantOrThrow(
        prisma,
        paymentId,
        merchant.id,
      );

      try {
        statusRules.chargeback.ensure(payment.status as PaymentStatus);
      } catch (e) {
        throw AppError.statusTransitionNotAllowed({
          from: payment.status,
          action: "simulate_chargeback",
          reason: e instanceof Error ? e.message : undefined,
        });
      }

      const updated = await prisma.payment.update({
        where: { id: paymentId },
        data: {
          upstreamStatus: PAYMENT_STATUS.CHARGEBACK,
        },
      });

      await prisma.paymentEvent.create({
        data: {
          paymentId: updated.id,
          type: "upstream_chargeback_simulated",
          status: updated.status,
          payload: {
            note: "Симулирован внешний сигнал банка о чарджбэке",
            upstreamStatus: PAYMENT_STATUS.CHARGEBACK,
          },
        },
      });

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
        upstreamStatus: updated.upstreamStatus,
      });
    } catch (err) {
      console.error("Ошибка simulate chargeback кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/logout", async (_req, res) => {
    clearSessionCookie(res, MERCHANT_PORTAL_COOKIE_NAME);
    return res.json({ ok: true });
  });

  router.get("/users", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(prisma, req);
      ensureMerchantPortalPermission(
        currentUser,
        "canManageMerchantUsers",
        "list_merchant_users",
      );

      const merchantUserRepo = (prisma as any).merchantUser;
      const users = await merchantUserRepo.findMany({
        where: {
          merchantId: merchant.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const items = [
        ...(merchant.email
          ? [
              {
                id: merchant.id,
                email: merchant.email,
                role: "owner",
                isActive: true,
                isLegacyOwner: true,
                createdAt: merchant.createdAt,
                updatedAt: merchant.updatedAt,
              },
            ]
          : []),
        ...users.map((user: any) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: Boolean(user.isActive),
          isLegacyOwner: false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      ];

      return res.json({
        ok: true,
        items,
      });
    } catch (err) {
      console.error("Ошибка списка пользователей мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.get("/audit-logs", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(prisma, req);
      ensureMerchantPortalPermission(
        currentUser,
        "canViewMerchantAudit",
        "view_merchant_audit_logs",
      );

      const actionFilter =
        typeof req.query.action === "string" ? req.query.action.trim() : "";
      const queryFilter =
        typeof req.query.query === "string"
          ? req.query.query.trim().toLowerCase()
          : "";
      const dateFromFilter =
        typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
      const dateToFilter =
        typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";
      const sortByRaw =
        typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "createdAt";
      const sortOrderRaw =
        typeof req.query.sortOrder === "string"
          ? req.query.sortOrder.trim().toLowerCase()
          : "desc";
      const rawPage = Number(req.query.page);
      const rawLimit = Number(req.query.limit);
      const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
      const take = Number.isInteger(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 200)
        : 20;
      const allowedSortBy = ["createdAt", "action", "actorType", "entityType"];
      const sortBy = allowedSortBy.includes(sortByRaw) ? sortByRaw : "createdAt";
      const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";
      const parsedDateFrom = dateFromFilter ? new Date(dateFromFilter) : null;
      const parsedDateTo = dateToFilter ? new Date(dateToFilter) : null;

      if (parsedDateFrom && Number.isNaN(parsedDateFrom.getTime())) {
        throw AppError.validationInvalidField(
          "query",
          "dateFrom",
          "Некорректная дата начала диапазона",
          dateFromFilter,
        );
      }

      if (parsedDateTo && Number.isNaN(parsedDateTo.getTime())) {
        throw AppError.validationInvalidField(
          "query",
          "dateTo",
          "Некорректная дата конца диапазона",
          dateToFilter,
        );
      }

      const dateFromBoundary = parsedDateFrom
        ? new Date(`${dateFromFilter}T00:00:00.000Z`)
        : null;
      const dateToBoundary = parsedDateTo
        ? new Date(`${dateToFilter}T23:59:59.999Z`)
        : null;

      const auditLogs = await (prisma as any).auditLog.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take,
      });

      const filteredItems = (auditLogs || [])
        .filter((log: any) => {
          if (log.entityType === "merchant" && log.entityId === merchant.id) {
            return true;
          }

          return (
            log.entityType === "merchant_user" &&
            log.payload &&
            typeof log.payload === "object" &&
            log.payload.merchantId === merchant.id
          );
        })
        .filter((log: any) =>
          actionFilter ? String(log.action || "") === actionFilter : true,
        )
        .filter((log: any) => {
          if (!queryFilter) {
            return true;
          }

          const searchable = [
            log.action,
            log.actorType,
            log.actorId,
            log.entityType,
            log.entityId,
            JSON.stringify(log.payload ?? {}),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(queryFilter);
        })
        .filter((log: any) => {
          const createdAt = new Date(log.createdAt);

          if (dateFromBoundary && createdAt < dateFromBoundary) {
            return false;
          }

          if (dateToBoundary && createdAt > dateToBoundary) {
            return false;
          }

          return true;
        })
        .map((log: any) => ({
          id: log.id,
          actorType: log.actorType,
          actorId: log.actorId,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          payload: log.payload ?? null,
          createdAt: log.createdAt,
        }));

      filteredItems.sort((left: any, right: any) => {
        const leftValue =
          sortBy === "createdAt"
            ? new Date(left.createdAt).getTime()
            : String(left[sortBy] || "").toLowerCase();
        const rightValue =
          sortBy === "createdAt"
            ? new Date(right.createdAt).getTime()
            : String(right[sortBy] || "").toLowerCase();

        if (leftValue === rightValue) {
          return 0;
        }

        const comparison = leftValue > rightValue ? 1 : -1;
        return sortOrder === "asc" ? comparison : comparison * -1;
      });

      const totalCount = filteredItems.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / take));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * take;
      const items = filteredItems.slice(skip, skip + take);

      return res.json({
        ok: true,
        filters: {
          action: actionFilter || null,
          query: queryFilter || null,
          dateFrom: dateFromFilter || null,
          dateTo: dateToFilter || null,
          sortBy,
          sortOrder,
          limit: take,
        },
        page: safePage,
        totalPages,
        totalCount,
        items,
      });
    } catch (err) {
      console.error("Ошибка audit log кабинета мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.post("/users", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(prisma, req);
      ensureMerchantPortalPermission(
        currentUser,
        "canManageMerchantUsers",
        "create_merchant_user",
      );
      requireFields("body", req.body, ["email", "password", "role"]);

      const merchantUserRepo = (prisma as any).merchantUser;
      const email = normalizeMerchantEmail(req.body.email);
      const password = String(req.body.password || "");
      const role = String(req.body.role || "manager").trim().toLowerCase();
      const allowedRoles = ["owner", "manager", "readonly"];

      if (!allowedRoles.includes(role)) {
        throw AppError.validationInvalidField(
          "body",
          "role",
          "Допустимые роли: owner, manager, readonly",
          role,
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Некорректный email пользователя мерчанта",
          email || "EMPTY",
        );
      }

      validateMerchantPassword(password);

      const existingMerchantUser = await merchantUserRepo.findUnique({
        where: { email },
      });
      const existingMerchant = await (prisma.merchant as any).findUnique({
        where: { email },
      });

      if (existingMerchantUser || existingMerchant) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Пользователь или владелец с таким email уже существует",
          email,
        );
      }

      const user = await merchantUserRepo.create({
        data: {
          merchantId: merchant.id,
          email,
          passwordHash: hashPortalPassword(password),
          role,
          isActive: true,
        },
      });
      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_user_created",
        entityType: "merchant_user",
        entityId: user.id,
        payload: buildMerchantAuditPayload(merchant, currentUser, {
          targetEmail: user.email,
          userEmail: user.email,
          userRole: user.role,
        }),
      });

      return res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: Boolean(user.isActive),
          isLegacyOwner: false,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (err) {
      console.error("Ошибка создания пользователя мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.patch("/users/:userId/deactivate", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(prisma, req);
      ensureMerchantPortalPermission(
        currentUser,
        "canManageMerchantUsers",
        "deactivate_merchant_user",
      );
      requireFields("params", req.params, ["userId"]);

      const merchantUserRepo = (prisma as any).merchantUser;
      const userId = String(req.params.userId);
      const user = await merchantUserRepo.findUnique({
        where: { id: userId },
      });

      if (!user || user.merchantId !== merchant.id) {
        throw AppError.validationError("Пользователь мерчанта не найден");
      }

      if (user.id === currentUser.id) {
        throw AppError.validationError("Нельзя деактивировать самого себя");
      }

      const updatedUser = await merchantUserRepo.update({
        where: { id: userId },
        data: {
          isActive: false,
        },
      });
      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_user_deactivated",
        entityType: "merchant_user",
        entityId: updatedUser.id,
        payload: buildMerchantAuditPayload(merchant, currentUser, {
          targetEmail: updatedUser.email,
          userEmail: updatedUser.email,
        }),
      });

      return res.json({
        ok: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          isActive: Boolean(updatedUser.isActive),
          isLegacyOwner: false,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
      });
    } catch (err) {
      console.error("Ошибка деактивации пользователя мерчанта:", err);
      return sendError(res, err);
    }
  });

  router.patch("/users/:userId/role", async (req, res) => {
    try {
      const { merchant, currentUser } = await getMerchantFromPortalToken(prisma, req);
      ensureMerchantPortalPermission(
        currentUser,
        "canManageMerchantUsers",
        "update_merchant_user_role",
      );
      requireFields("params", req.params, ["userId"]);
      requireFields("body", req.body, ["role"]);

      const merchantUserRepo = (prisma as any).merchantUser;
      const userId = String(req.params.userId);
      const nextRole = String(req.body.role || "").trim().toLowerCase();
      const allowedRoles = ["owner", "manager", "readonly"];

      if (!allowedRoles.includes(nextRole)) {
        throw AppError.validationInvalidField(
          "body",
          "role",
          "Допустимые роли: owner, manager, readonly",
          nextRole,
        );
      }

      const user = await merchantUserRepo.findUnique({
        where: { id: userId },
      });

      if (!user || user.merchantId !== merchant.id) {
        throw AppError.validationError("Пользователь мерчанта не найден");
      }

      const updatedUser = await merchantUserRepo.update({
        where: { id: userId },
        data: {
          role: nextRole,
        },
      });

      await writeAuditLog(prisma, {
        actorType: currentUser.isLegacyOwner ? "merchant_owner" : "merchant_user",
        actorId: currentUser.id,
        action: "merchant_user_role_updated",
        entityType: "merchant_user",
        entityId: updatedUser.id,
        payload: buildMerchantAuditPayload(merchant, currentUser, {
          targetEmail: updatedUser.email,
          userEmail: updatedUser.email,
          previousRole: user.role,
          nextRole,
          userRole: nextRole,
        }),
      });

      return res.json({
        ok: true,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          isActive: Boolean(updatedUser.isActive),
          isLegacyOwner: false,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
      });
    } catch (err) {
      console.error("Ошибка смены роли пользователя мерчанта:", err);
      return sendError(res, err);
    }
  });

  return router;
}
