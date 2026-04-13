import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { sendError } from "../core/httpError";
import { AppError } from "../core/errors";
import { PAYMENT_STATUS } from "../core/statuses";
import { requireFields } from "../core/requestValidation";
import { writeAuditLog } from "../core/auditLog";
import {
  createPspAdminToken,
  extractPspAdminTokenFromRequest,
  hashAdminPassword,
  normalizeAdminEmail,
  PSP_ADMIN_COOKIE_NAME,
  validateAdminPassword,
  verifyAdminPassword,
  verifyPspAdminToken,
} from "./pspAdminAuth";
import {
  hashPortalPassword,
  normalizeMerchantEmail,
  validateMerchantPassword,
} from "../merchant/merchantPortalAuth";
import { clearSessionCookie, setSessionCookie } from "../core/sessionCookies";
import { createRateLimitMiddleware } from "../core/rateLimit";
import { getRateLimitDiagnostics } from "../core/rateLimit";
import { getPaymentOrThrow } from "../core/domain";
import { statusRules } from "../core/asserts";
import { PaymentStatus } from "../core/statuses";
import {
  cancelPayment,
  capturePayment,
  refundPayment,
  retryPayment,
  applyChargeback,
} from "../core/transitions";
import { getProviderByCode } from "../providers/registry";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpProvisioningUri,
  generateTotpSecret,
  getTotpIssuer,
  hashRecoveryCodes,
  parseRecoveryCodeHashes,
  serializeRecoveryCodeHashes,
  verifyTotpCode,
} from "./totp";

async function getPspUserFromToken(
  prisma: PrismaClient,
  req: any,
) {
  const pspUserRepo = (prisma as any).pspUser;
  const token = extractPspAdminTokenFromRequest(req);
  const payload = verifyPspAdminToken(token);

  const user = await pspUserRepo.findUnique({
    where: {
      id: payload.userId,
    },
  });

  if (!user || user.email !== payload.email || user.role !== payload.role) {
    throw AppError.invalidAdminToken();
  }

  return user;
}

function getPspAdminPermissions(role: string) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const canViewMerchants = ["admin", "support", "risk", "readonly"].includes(
    normalizedRole,
  );
  const canViewPayments = ["admin", "support", "risk", "readonly"].includes(
    normalizedRole,
  );
  const canManagePayments = ["admin", "support"].includes(normalizedRole);

  return {
    canCreatePspUsers: normalizedRole === "admin",
    canCreateMerchants: normalizedRole === "admin",
    canRevealMerchantApiKeys: normalizedRole === "admin",
    canViewPspUsers: normalizedRole === "admin",
    canViewAuditLogs: ["admin", "risk"].includes(normalizedRole),
    canViewSecurityStatus: ["admin", "risk"].includes(normalizedRole),
    canManageOwnTwoFactor: ["admin", "support", "risk", "readonly"].includes(
      normalizedRole,
    ),
    canViewMerchants,
    canViewPayments,
    canManagePayments,
  };
}

function buildPspAdminProfile(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: getPspAdminPermissions(user.role),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorRecoveryCodesRemaining: parseRecoveryCodeHashes(
      user.twoFactorRecoveryCodes,
    ).length,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function ensurePspAdminRole(user: any, allowedRoles: string[], action: string) {
  if (!allowedRoles.includes(String(user.role || ""))) {
    throw AppError.forbiddenAdminAction(action, user.role);
  }
}

function ensurePspAdminPermission(user: any, permission: string, action: string) {
  const permissions = getPspAdminPermissions(user.role);

  if (!(permissions as Record<string, boolean>)[permission]) {
    throw AppError.forbiddenAdminAction(action, user.role);
  }
}

function maskApiKeyValue(value: string) {
  const normalized = String(value || "");
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function getRequestEmail(req: any) {
  return normalizeAdminEmail(String(req?.body?.email || ""));
}

export function createPspAdminRouter(prisma: PrismaClient) {
  const router = Router();
  const loginRateLimit = createRateLimitMiddleware({
    key: "psp_admin_login",
    windowMs: 60_000,
    maxRequests: 5,
    onLimit: async (req, retryAfterSeconds) => {
      await writeAuditLog(prisma, {
        actorType: "anonymous",
        actorId: null,
        action: "psp_admin_rate_limited",
        entityType: "auth_scope",
        entityId: "psp_admin_login",
        payload: {
          email: getRequestEmail(req),
          path: req.path,
          retryAfterSeconds,
        },
      });
    },
  });
  const setupTwoFactorRateLimit = createRateLimitMiddleware({
    key: "psp_admin_2fa_setup",
    windowMs: 60_000,
    maxRequests: 5,
    onLimit: async (req, retryAfterSeconds) => {
      await writeAuditLog(prisma, {
        actorType: "anonymous",
        actorId: null,
        action: "psp_admin_rate_limited",
        entityType: "auth_scope",
        entityId: "psp_admin_2fa_setup",
        payload: {
          path: req.path,
          retryAfterSeconds,
        },
      });
    },
  });
  const verifyTwoFactorRateLimit = createRateLimitMiddleware({
    key: "psp_admin_2fa_verify",
    windowMs: 60_000,
    maxRequests: 5,
    onLimit: async (req, retryAfterSeconds) => {
      await writeAuditLog(prisma, {
        actorType: "anonymous",
        actorId: null,
        action: "psp_admin_rate_limited",
        entityType: "auth_scope",
        entityId: "psp_admin_2fa_verify",
        payload: {
          path: req.path,
          retryAfterSeconds,
        },
      });
    },
  });
  const revealApiKeyRateLimit = createRateLimitMiddleware({
    key: "psp_admin_reveal_api_key",
    windowMs: 60_000,
    maxRequests: 3,
    onLimit: async (req, retryAfterSeconds) => {
      await writeAuditLog(prisma, {
        actorType: "anonymous",
        actorId: null,
        action: "psp_admin_rate_limited",
        entityType: "auth_scope",
        entityId: "psp_admin_reveal_api_key",
        payload: {
          path: req.path,
          merchantId: String(req.params?.merchantId || ""),
          retryAfterSeconds,
        },
      });
    },
  });
  const recoveryCodesRateLimit = createRateLimitMiddleware({
    key: "psp_admin_recovery_codes_regenerate",
    windowMs: 60_000,
    maxRequests: 3,
    onLimit: async (req, retryAfterSeconds) => {
      await writeAuditLog(prisma, {
        actorType: "anonymous",
        actorId: null,
        action: "psp_admin_rate_limited",
        entityType: "auth_scope",
        entityId: "psp_admin_recovery_codes_regenerate",
        payload: {
          path: req.path,
          retryAfterSeconds,
        },
      });
    },
  });

  router.get("/bootstrap-status", async (_req, res) => {
    try {
      const pspUserRepo = (prisma as any).pspUser;
      const usersCount = await pspUserRepo.count();

      return res.json({
        ok: true,
        canSelfRegister: usersCount === 0,
        usersCount,
      });
    } catch (err) {
      console.error("Ошибка bootstrap status PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/register", async (req, res) => {
    try {
      const pspUserRepo = (prisma as any).pspUser;
      requireFields("body", req.body, ["email", "password"]);

      const email = normalizeAdminEmail(req.body.email);
      const password = String(req.body.password || "");
      const role = String(req.body.role || "admin").trim() || "admin";
      const allowedRoles = ["admin", "support", "risk", "readonly"];

      if (!allowedRoles.includes(role)) {
        throw AppError.validationInvalidField(
          "body",
          "role",
          "Допустимые роли PSP admin: admin, support, risk, readonly",
          role,
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "Некорректный email администратора PSP",
          email || "EMPTY",
        );
      }

      validateAdminPassword(password);

      const existingUsersCount = await pspUserRepo.count();
      let creatorUser: any = null;

      if (existingUsersCount > 0) {
        creatorUser = await getPspUserFromToken(prisma, req);
        ensurePspAdminRole(creatorUser, ["admin"], "create_psp_user");
      }

      const existingUser = await pspUserRepo.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw AppError.validationInvalidField(
          "body",
          "email",
          "PSP admin с таким email уже существует",
          email,
        );
      }

      const user = await pspUserRepo.create({
        data: {
          email,
          passwordHash: hashAdminPassword(password),
          role,
        },
      });

      await writeAuditLog(prisma, {
        actorType: creatorUser ? "psp_user" : "system_bootstrap",
        actorId: creatorUser?.id || null,
        action: "psp_user_created",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
          role: user.role,
          bootstrap: !creatorUser,
        },
      });

      let token: string | null = null;

      if (!creatorUser) {
        token = createPspAdminToken(user.id, user.email, user.role);
        setSessionCookie(res, PSP_ADMIN_COOKIE_NAME, token);
      }

      return res.json({
        ok: true,
        token,
        user: buildPspAdminProfile(user),
      });
    } catch (err) {
      console.error("Ошибка регистрации PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/login", loginRateLimit, async (req, res) => {
    try {
      const pspUserRepo = (prisma as any).pspUser;
      requireFields("body", req.body, ["email", "password"]);

      const email = normalizeAdminEmail(req.body.email);
      const password = String(req.body.password || "");
      const twoFactorCode = String(req.body.twoFactorCode || "");

      const user = await pspUserRepo.findUnique({
        where: { email },
      });

      if (
        !user ||
        !user.passwordHash ||
        !verifyAdminPassword(password, user.passwordHash)
      ) {
        throw AppError.invalidAdminCredentials();
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorCode.trim()) {
          throw AppError.twoFactorRequired();
        }

        const validTotp =
          Boolean(user.twoFactorSecret) &&
          verifyTotpCode(user.twoFactorSecret, twoFactorCode);

        if (!validTotp) {
          const recoveryAttempt = consumeRecoveryCode(
            user.twoFactorRecoveryCodes,
            twoFactorCode,
          );

          if (recoveryAttempt.matched) {
            await pspUserRepo.update({
              where: {
                id: user.id,
              },
              data: {
                twoFactorRecoveryCodes: serializeRecoveryCodeHashes(
                  recoveryAttempt.remainingHashes,
                ),
              },
            });

            await writeAuditLog(prisma, {
              actorType: "psp_user",
              actorId: user.id,
              action: "psp_user_logged_in_with_recovery_code",
              entityType: "psp_user",
              entityId: user.id,
              payload: {
                email: user.email,
                role: user.role,
                recoveryCodesRemaining: recoveryAttempt.remainingHashes.length,
              },
            });
          } else {
            await writeAuditLog(prisma, {
              actorType: "psp_user",
              actorId: user.id,
              action: "psp_user_login_2fa_denied",
              entityType: "psp_user",
              entityId: user.id,
              payload: {
                email: user.email,
                role: user.role,
              },
            });

            throw AppError.invalidTwoFactorCode();
          }
        }
      }

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "psp_user_logged_in",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
          role: user.role,
        },
      });

      const token = createPspAdminToken(user.id, user.email, user.role);
      setSessionCookie(res, PSP_ADMIN_COOKIE_NAME, token);

      return res.json({
        ok: true,
        token,
        user: buildPspAdminProfile(user),
      });
    } catch (err) {
      console.error("Ошибка входа PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/setup", setupTwoFactorRateLimit, async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManageOwnTwoFactor", "setup_own_2fa");
      const pspUserRepo = (prisma as any).pspUser;
      const secret = generateTotpSecret();

      await pspUserRepo.update({
        where: {
          id: user.id,
        },
        data: {
          twoFactorSecret: secret,
          twoFactorEnabled: false,
        },
      });

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "psp_admin_2fa_setup_started",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
        },
      });

      return res.json({
        ok: true,
        issuer: getTotpIssuer(),
        accountName: user.email,
        secret,
        otpauthUrl: generateTotpProvisioningUri(user.email, secret),
      });
    } catch (err) {
      console.error("Ошибка запуска setup 2FA PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/enable", verifyTwoFactorRateLimit, async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManageOwnTwoFactor", "enable_own_2fa");
      const pspUserRepo = (prisma as any).pspUser;
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      if (!user.passwordHash || !verifyAdminPassword(password, user.passwordHash)) {
        await writeAuditLog(prisma, {
          actorType: "psp_user",
          actorId: user.id,
          action: "psp_admin_2fa_enable_denied",
          entityType: "psp_user",
          entityId: user.id,
          payload: {
            reason: "invalid_password_confirmation",
          },
        });

        throw AppError.invalidAdminPasswordConfirmation();
      }

      if (!user.twoFactorSecret) {
        throw AppError.validationError("Сначала запусти настройку 2FA");
      }

      if (!verifyTotpCode(user.twoFactorSecret, code)) {
        await writeAuditLog(prisma, {
          actorType: "psp_user",
          actorId: user.id,
          action: "psp_admin_2fa_enable_denied",
          entityType: "psp_user",
          entityId: user.id,
          payload: {
            reason: "invalid_totp_code",
          },
        });

        throw AppError.invalidTwoFactorCode();
      }

      const recoveryCodes = generateRecoveryCodes();
      const updatedUser = await pspUserRepo.update({
        where: {
          id: user.id,
        },
        data: {
          twoFactorEnabled: true,
          twoFactorRecoveryCodes: serializeRecoveryCodeHashes(
            hashRecoveryCodes(recoveryCodes),
          ),
        },
      });

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "psp_admin_2fa_enabled",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
        },
      });

      return res.json({
        ok: true,
        user: buildPspAdminProfile(updatedUser),
        recoveryCodes,
      });
    } catch (err) {
      console.error("Ошибка включения 2FA PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/2fa/disable", verifyTwoFactorRateLimit, async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManageOwnTwoFactor", "disable_own_2fa");
      const pspUserRepo = (prisma as any).pspUser;
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      if (!user.passwordHash || !verifyAdminPassword(password, user.passwordHash)) {
        await writeAuditLog(prisma, {
          actorType: "psp_user",
          actorId: user.id,
          action: "psp_admin_2fa_disable_denied",
          entityType: "psp_user",
          entityId: user.id,
          payload: {
            reason: "invalid_password_confirmation",
          },
        });

        throw AppError.invalidAdminPasswordConfirmation();
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        throw AppError.validationError("2FA для PSP admin сейчас не включена");
      }

      if (!verifyTotpCode(user.twoFactorSecret, code)) {
        await writeAuditLog(prisma, {
          actorType: "psp_user",
          actorId: user.id,
          action: "psp_admin_2fa_disable_denied",
          entityType: "psp_user",
          entityId: user.id,
          payload: {
            reason: "invalid_totp_code",
          },
        });

        throw AppError.invalidTwoFactorCode();
      }

      const updatedUser = await pspUserRepo.update({
        where: {
          id: user.id,
        },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorRecoveryCodes: null,
        },
      });

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "psp_admin_2fa_disabled",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
        },
      });

      return res.json({
        ok: true,
        user: buildPspAdminProfile(updatedUser),
      });
    } catch (err) {
      console.error("Ошибка отключения 2FA PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/me", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);

      return res.json({
        ok: true,
        user: buildPspAdminProfile(user),
      });
    } catch (err) {
      console.error("Ошибка загрузки профиля PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/overview", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      const permissions = getPspAdminPermissions(user.role);

      const merchants = permissions.canViewMerchants
        ? await prisma.merchant.findMany({
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              name: true,
              email: true,
              apiKey: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : [];

      const payments = permissions.canViewPayments
        ? await prisma.payment.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              merchantId: true,
              amount: true,
              currency: true,
              status: true,
              providerCode: true,
              upstreamStatus: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : [];

      const merchantsCount = await prisma.merchant.count();
      const paymentsCount = await prisma.payment.count();

      const paymentsByStatus: Record<string, number> = {};
      for (const payment of payments) {
        const key = payment.status || "unknown";
        paymentsByStatus[key] = (paymentsByStatus[key] || 0) + 1;
      }

      return res.json({
        ok: true,
        user: buildPspAdminProfile(user),
        summary: {
          merchantsCount,
          paymentsCount,
          recentPaymentsCount: payments.length,
          paymentsByStatus,
        },
        merchants: merchants.map((merchant) => ({
          ...merchant,
          apiKeyMasked: `${merchant.apiKey.slice(0, 6)}...${merchant.apiKey.slice(-4)}`,
        })),
        recentPayments: payments,
      });
    } catch (err) {
      console.error("Ошибка overview PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/merchants", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canViewMerchants", "list_merchants");

      const merchants = await prisma.merchant.findMany({
        orderBy: { createdAt: "desc" },
      });

      return res.json({
        ok: true,
        items: merchants.map((merchant) => ({
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          apiKeyMasked: maskApiKeyValue(merchant.apiKey),
          createdAt: merchant.createdAt,
          updatedAt: merchant.updatedAt,
        })),
      });
    } catch (err) {
      console.error("Ошибка списка мерчантов PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/merchants", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canCreateMerchants", "create_merchant");
      requireFields("body", req.body, ["name", "email", "password"]);

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

      const existingMerchant = await prisma.merchant.findUnique({
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

      const merchant = await prisma.merchant.create({
        data: {
          name,
          email,
          passwordHash: hashPortalPassword(password),
          apiKey: "mch_" + randomBytes(16).toString("hex"),
        },
      });

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "merchant_created_by_psp_admin",
        entityType: "merchant",
        entityId: merchant.id,
        payload: {
          actorRole: user.role,
          merchantEmail: merchant.email || null,
        },
      });

      return res.json({
        ok: true,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchant.email,
          apiKeyMasked: maskApiKeyValue(merchant.apiKey),
          apiKey: merchant.apiKey,
          createdAt: merchant.createdAt,
          updatedAt: merchant.updatedAt,
        },
      });
    } catch (err) {
      console.error("Ошибка создания мерчанта из PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/payments", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canViewPayments", "list_payments");

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
      const pageNumber = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
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
        ...(status ? { status } : {}),
        ...(providerCode ? { providerCode } : {}),
        ...(search
          ? {
              OR: [
                { id: { contains: search, mode: "insensitive" as const } },
                { merchantId: { contains: search, mode: "insensitive" as const } },
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
        ok: true,
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
          merchantId: payment.merchantId,
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
      console.error("Ошибка списка платежей PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/payment/details/:paymentId", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canViewPayments", "view_payment_details");

      const payment = await prisma.payment.findUnique({
        where: {
          id: String(req.params.paymentId || ""),
        },
      });

      if (!payment) {
        throw AppError.paymentNotFound(String(req.params.paymentId || ""));
      }

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
        ok: true,
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
      console.error("Ошибка деталей платежа PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/process", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "process_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);
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
      console.error("Ошибка process PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/retry", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "retry_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
      console.error("Ошибка retry PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/capture", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "capture_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
      console.error("Ошибка capture PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/refund", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "refund_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
      console.error("Ошибка refund PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/cancel", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "cancel_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
      console.error("Ошибка cancel PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/chargeback", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canManagePayments", "chargeback_payment");
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
        "Симулированный чарджбэк из PSP Admin",
      );

      return res.json({
        ok: true,
        paymentId: updated.id,
        status: updated.status,
      });
    } catch (err) {
      console.error("Ошибка chargeback PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/payment/simulate-chargeback", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(
        user,
        "canManagePayments",
        "simulate_chargeback_payment",
      );
      requireFields("body", req.body, ["paymentId"]);

      const paymentId = String(req.body.paymentId || "");
      const payment = await getPaymentOrThrow(prisma, paymentId);

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
      console.error("Ошибка simulate chargeback PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/users", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canViewPspUsers", "list_psp_users");

      const pspUserRepo = (prisma as any).pspUser;
      const users = await pspUserRepo.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json({
        ok: true,
        items: users.map(buildPspAdminProfile),
      });
    } catch (err) {
      console.error("Ошибка списка PSP users:", err);
      return sendError(res, err);
    }
  });

  router.get("/audit-logs", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(user, "canViewAuditLogs", "list_audit_logs");

      const auditRepo = (prisma as any).auditLog;
      const logs = await auditRepo.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      });

      return res.json({
        ok: true,
        items: logs,
      });
    } catch (err) {
      console.error("Ошибка списка audit logs PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.get("/security/status", async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(
        user,
        "canViewSecurityStatus",
        "view_security_status",
      );

      return res.json({
        ok: true,
        rateLimit: getRateLimitDiagnostics(),
      });
    } catch (err) {
      console.error("Ошибка security status PSP admin:", err);
      return sendError(res, err);
    }
  });

  router.post("/merchants/:merchantId/reveal-api-key", revealApiKeyRateLimit, async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminRole(user, ["admin"], "reveal_merchant_api_key");
      requireFields("params", req.params, ["merchantId"]);
      requireFields("body", req.body, ["password"]);

      const password = String(req.body.password || "");

      if (!user.passwordHash || !verifyAdminPassword(password, user.passwordHash)) {
        await writeAuditLog(prisma, {
          actorType: "psp_user",
          actorId: user.id,
          action: "merchant_api_key_reveal_denied",
          entityType: "merchant",
          entityId: String(req.params.merchantId),
          payload: {
            actorRole: user.role,
            reason: "invalid_password_confirmation",
          },
        });

        throw AppError.invalidAdminPasswordConfirmation();
      }

      const merchant = await prisma.merchant.findUnique({
        where: {
          id: String(req.params.merchantId),
        },
      });

      if (!merchant) {
        throw AppError.merchantNotFound();
      }

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "merchant_api_key_revealed",
        entityType: "merchant",
        entityId: merchant.id,
        payload: {
          merchantEmail: merchant.email || null,
          actorRole: user.role,
          stepUp: "password_confirmation",
        },
      });

      return res.json({
        ok: true,
        merchantId: merchant.id,
        apiKey: merchant.apiKey,
      });
    } catch (err) {
      console.error("Ошибка reveal merchant api key:", err);
      return sendError(res, err);
    }
  });

  router.post("/logout", async (_req, res) => {
    clearSessionCookie(res, PSP_ADMIN_COOKIE_NAME);
    return res.json({ ok: true });
  });

  router.post("/2fa/recovery-codes/regenerate", recoveryCodesRateLimit, async (req, res) => {
    try {
      const user = await getPspUserFromToken(prisma, req);
      ensurePspAdminPermission(
        user,
        "canManageOwnTwoFactor",
        "regenerate_recovery_codes",
      );
      const pspUserRepo = (prisma as any).pspUser;
      requireFields("body", req.body, ["password", "code"]);

      const password = String(req.body.password || "");
      const code = String(req.body.code || "");

      if (!user.passwordHash || !verifyAdminPassword(password, user.passwordHash)) {
        throw AppError.invalidAdminPasswordConfirmation();
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        throw AppError.validationError("Сначала включи 2FA для PSP admin");
      }

      if (!verifyTotpCode(user.twoFactorSecret, code)) {
        throw AppError.invalidTwoFactorCode();
      }

      const recoveryCodes = generateRecoveryCodes();
      const updatedUser = await pspUserRepo.update({
        where: {
          id: user.id,
        },
        data: {
          twoFactorRecoveryCodes: serializeRecoveryCodeHashes(
            hashRecoveryCodes(recoveryCodes),
          ),
        },
      });

      await writeAuditLog(prisma, {
        actorType: "psp_user",
        actorId: user.id,
        action: "psp_admin_2fa_recovery_codes_regenerated",
        entityType: "psp_user",
        entityId: user.id,
        payload: {
          email: user.email,
        },
      });

      return res.json({
        ok: true,
        user: buildPspAdminProfile(updatedUser),
        recoveryCodes,
      });
    } catch (err) {
      console.error("Ошибка перевыпуска recovery codes PSP admin:", err);
      return sendError(res, err);
    }
  });

  return router;
}
