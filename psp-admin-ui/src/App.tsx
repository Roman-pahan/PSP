import { useCallback, useEffect, useState } from "react";
import "./App.css";
import PublicCheckoutPage from "./PublicCheckoutPage";

type AppPage =
  | "psp_admin"
  | "merchant_portal"
  | "client_checkout"
  | "checkout_stub"
  | "public_checkout";

type PaymentItem = {
  id: string; // id платежа
  merchantOrderId: string | null; // внешний id заказа мерчанта
  amount: string; // сумма
  currency: string; // валюта
  status: string; // статус
  providerCode: string; // код провайдера
  upstreamId: string | null; // внешний id
  upstreamStatus: string | null; // внешний статус
  createdAt: string; // дата создания
  updatedAt: string; // дата обновления
};

type PaymentDetailsResponse = {
  payment: {
    id: string; // id платежа
    merchantId: string; // id мерчанта
    merchantOrderId: string | null; // внешний id заказа мерчанта
    amount: string; // сумма
    currency: string; // валюта
    status: string; // статус
    method: string; // метод
    direction: string; // направление
    providerCode: string; // код провайдера
    upstreamId: string | null; // внешний id
    upstreamStatus: string | null; // внешний статус
    createdAt: string; // дата создания
    updatedAt: string; // дата обновления
  };
  card: {
    id: string; // id карты
    bin: string; // bin
    last4: string; // последние 4 цифры
    brand: string; // бренд
    expMonth: number; // месяц
    expYear: number; // год
  } | null;
  events: Array<{
    id: string; // id события
    type: string; // тип события
    status: string; // статус события
    payload: Record<string, unknown>; // payload
    createdAt: string; // дата события
  }>;
};

type MerchantPortalProfile = {
  id: string;
  name: string;
  email: string | null;
  currentUser: {
    id: string;
    email: string;
    role: string;
    isLegacyOwner: boolean;
    twoFactorEnabled: boolean;
    permissions: {
      canManageMerchantProfile: boolean;
      canRotateApiKey: boolean;
      canManageMerchantUsers: boolean;
      canViewMerchantAudit: boolean;
      canViewPayments: boolean;
      canManagePayments: boolean;
    };
  } | null;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
};

type MerchantTeamUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  isLegacyOwner: boolean;
  createdAt: string;
  updatedAt: string;
};

type MerchantAuditLogItem = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

type MerchantAuditFilters = {
  action: string;
  query: string;
  dateFrom: string;
  dateTo: string;
  sortBy: "createdAt" | "action" | "actorType" | "entityType";
  sortOrder: "asc" | "desc";
};

type MerchantAuditPagination = {
  page: number;
  totalPages: number;
  totalCount: number;
};

type MerchantPortalTab = "profile" | "payments" | "events";

type MerchantPortalTwoFactorSetup = {
  issuer: string;
  accountName: string;
  secret: string;
  otpauthUrl: string;
};

type PaymentTableFilters = {
  status: string;
  providerCode: string;
  search: string;
  sortBy: "createdAt" | "updatedAt" | "amount" | "status" | "providerCode";
  sortOrder: "asc" | "desc";
};

type MerchantPortalOverviewResponse = {
  ok: true;
  merchant: MerchantPortalProfile;
  summary: {
    totalCount: number;
    byStatus: Record<string, number>;
    byProvider: Record<string, number>;
  };
  recentPayments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    providerCode: string | null;
    upstreamStatus: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

type PspAdminUser = {
  id: string;
  email: string;
  role: string;
  permissions: {
    canCreatePspUsers: boolean;
    canCreateMerchants: boolean;
    canRevealMerchantApiKeys: boolean;
    canViewPspUsers: boolean;
    canViewAuditLogs: boolean;
    canViewSecurityStatus: boolean;
    canManageOwnTwoFactor: boolean;
    canViewMerchants: boolean;
    canViewPayments: boolean;
    canManagePayments: boolean;
  };
  twoFactorEnabled: boolean;
  twoFactorRecoveryCodesRemaining: number;
  createdAt: string;
  updatedAt: string;
};

type PspAdminTwoFactorSetup = {
  issuer: string;
  accountName: string;
  secret: string;
  otpauthUrl: string;
};

type PspAdminOverviewResponse = {
  ok: true;
  user: PspAdminUser;
  summary: {
    merchantsCount: number;
    paymentsCount: number;
    recentPaymentsCount: number;
    paymentsByStatus: Record<string, number>;
  };
  merchants: Array<{
    id: string;
    name: string;
    email: string | null;
    apiKeyMasked: string;
    createdAt: string;
    updatedAt: string;
  }>;
  recentPayments: Array<{
    id: string;
    merchantId: string;
    amount: string;
    currency: string;
    status: string;
    providerCode: string | null;
    upstreamStatus: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

type PspAdminPaymentItem = {
  id: string;
  merchantId: string;
  merchantOrderId: string | null;
  amount: string;
  currency: string;
  status: string;
  providerCode: string | null;
  upstreamId: string | null;
  upstreamStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type PspAdminPaymentsResponse = {
  ok: true;
  count: number;
  totalCount: number;
  page: number;
  totalPages: number;
  filters: {
    status: string | null;
    providerCode: string | null;
    search: string | null;
    sortBy: PaymentTableFilters["sortBy"];
    sortOrder: "asc" | "desc";
    limit: number;
  };
  items: PspAdminPaymentItem[];
};

type PspAdminPaymentDetailsResponse = {
  ok: true;
  payment: PaymentDetailsResponse["payment"];
  card: PaymentDetailsResponse["card"];
  events: PaymentDetailsResponse["events"];
};

type PspAdminSecurityStatusResponse = {
  ok: true;
  rateLimit: {
    configuredBackend: string;
    activeBackend: string;
    redisConfigured: boolean;
    redisFallbackActive: boolean;
    memoryBucketCount: number;
  };
};

type PspAdminTab = "security" | "users" | "merchants" | "payments" | "audit";

type BootstrapStatusResponse = {
  ok: true;
  canSelfRegister: boolean;
};

type AuditLogItem = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

const auditActionLabels: Record<string, string> = {
  merchant_portal_registered: "Регистрация кабинета",
  merchant_owner_logged_in: "Мерчант вошёл в кабинет",
  merchant_user_logged_in: "Пользователь вошёл в кабинет",
  merchant_profile_updated: "Обновлён профиль мерчанта",
  merchant_api_key_rotated: "Ротирован API-ключ",
  merchant_api_key_revealed: "Показан API-ключ",
  merchant_user_created: "Создан пользователь команды",
  merchant_user_deactivated: "Пользователь деактивирован",
  merchant_user_role_updated: "Изменена роль пользователя",
  merchant_2fa_setup_started: "Начата настройка 2FA",
  merchant_2fa_enabled: "2FA включена",
  merchant_2fa_disabled: "2FA отключена",
  psp_user_created: "Создан пользователь PSP",
  psp_user_logged_in: "Пользователь PSP вошёл в кабинет",
  psp_user_logged_in_with_recovery_code:
    "Пользователь PSP вошёл по recovery code",
  psp_user_login_2fa_denied: "Вход PSP отклонён по 2FA",
  psp_admin_2fa_setup_started: "Начата настройка 2FA PSP",
  psp_admin_2fa_enable_denied: "Включение 2FA PSP отклонено",
  psp_admin_2fa_enabled: "2FA PSP включена",
  psp_admin_2fa_disable_denied: "Отключение 2FA PSP отклонено",
  psp_admin_2fa_disabled: "2FA PSP отключена",
  psp_admin_2fa_recovery_codes_regenerated:
    "Перевыпущены recovery codes PSP",
  psp_admin_rate_limited: "Сработал rate limit PSP",
  merchant_created_by_psp_admin: "Мерчант создан из PSP",
  merchant_api_key_reveal_denied: "Показ API-ключа мерчанта отклонён",
  retry: "Повторная отправка платежа",
  capture: "Подтверждено списание",
  refund: "Выполнен возврат",
  cancel: "Платёж отменён",
  chargeback: "Платёж переведён в чарджбэк",
  simulate_chargeback: "Симулирован чарджбэк от банка-эквайера",
};

const auditFieldLabels: Record<string, string> = {
  merchantEmail: "Email мерчанта",
  merchantName: "Название мерчанта",
  email: "Email",
  role: "Роль",
  actorRole: "Роль",
  actorEmail: "Кто выполнил",
  targetEmail: "Пользователь",
  previousRole: "Старая роль",
  nextRole: "Новая роль",
  apiKeyMasked: "API-ключ",
  userId: "ID пользователя",
  merchantId: "ID мерчанта",
};

const auditActorLabels: Record<string, string> = {
  merchant_owner: "Владелец",
  merchant_user: "Пользователь команды",
  psp_admin: "PSP Admin",
  psp_user: "Пользователь PSP",
  anonymous: "Анонимный запрос",
  system: "Система",
  merchant: "Мерчант",
};

const auditEntityLabels: Record<string, string> = {
  merchant: "Мерчант",
  merchant_user: "Пользователь команды",
  psp_user: "Пользователь PSP",
  auth_scope: "Область авторизации",
  api_key: "API-ключ",
  profile: "Профиль",
};

function formatAuditLabel(value: string) {
  if (auditFieldLabels[value]) {
    return auditFieldLabels[value];
  }

  if (auditActionLabels[value]) {
    return auditActionLabels[value];
  }

  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatAuditAction(value: string) {
  return auditActionLabels[value] || formatAuditLabel(value);
}

function formatAuditActor(value: string) {
  return auditActorLabels[value] || formatAuditLabel(value);
}

function formatAuditEntity(value: string) {
  return auditEntityLabels[value] || formatAuditLabel(value);
}

function getStoredPspAdminTab(): PspAdminTab {
  const value = localStorage.getItem("psp_admin_tab");
  const allowedTabs: PspAdminTab[] = [
    "payments",
    "audit",
    "merchants",
    "users",
    "security",
  ];

  if (value && allowedTabs.includes(value as PspAdminTab)) {
    return value as PspAdminTab;
  }

  return "payments";
}

function getFirstAvailablePspAdminTab(permissions?: PspAdminUser["permissions"] | null): PspAdminTab {
  if (permissions?.canViewPayments) {
    return "payments";
  }

  if (permissions?.canViewAuditLogs) {
    return "audit";
  }

  if (permissions?.canViewMerchants) {
    return "merchants";
  }

  if (permissions?.canViewPspUsers) {
    return "users";
  }

  return "security";
}

function formatAuditPayloadValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatAuditPayloadValue(item)).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${formatAuditLabel(key)}: ${formatAuditPayloadValue(nestedValue)}`)
      .join("; ");
  }

  return String(value);
}

function getAuditPayloadRows(
  payload: Record<string, unknown> | null,
  options?: {
    hiddenKeys?: string[];
  },
) {
  if (!payload || !Object.keys(payload).length) {
    return [];
  }

  const hiddenKeys = new Set(options?.hiddenKeys || []);

  return Object.entries(payload)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => ({
      key: formatAuditLabel(key),
      value: formatAuditPayloadValue(value),
    }));
}

function App() {
  function generateFrontendMerchantOrderId(prefix = "order") {
    const safePrefix =
      String(prefix || "order")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") || "order";
    const randomChunk = Math.random().toString(36).slice(2, 8);

    return `${safePrefix}_${Date.now()}_${randomChunk}`;
  }

  const defaultApiBase =
    import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3000";

  // Какая страница сейчас открыта в панели
  const [activePage, setActivePage] = useState<AppPage>("merchant_portal");
  //Адрес backend
  const [apiBase, setApiBase] = useState(defaultApiBase);
  //API-ключ мерчанта
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("psp_api_key") || "";
  });
  const [merchantPortalToken, setMerchantPortalToken] = useState("");
  const [merchantPortalProfile, setMerchantPortalProfile] =
    useState<MerchantPortalProfile | null>(null);
  const [merchantPortalOverview, setMerchantPortalOverview] =
    useState<MerchantPortalOverviewResponse | null>(null);
  const [merchantPortalUsers, setMerchantPortalUsers] = useState<MerchantTeamUser[]>(
    [],
  );
  const [merchantPortalAuditLogs, setMerchantPortalAuditLogs] = useState<
    MerchantAuditLogItem[]
  >([]);
  const [merchantAuditFilters, setMerchantAuditFilters] =
    useState<MerchantAuditFilters>({
      action: "",
      query: "",
      dateFrom: "",
      dateTo: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  const [merchantAuditPagination, setMerchantAuditPagination] =
    useState<MerchantAuditPagination>({
      page: 1,
      totalPages: 1,
      totalCount: 0,
    });
  const [merchantPortalTab, setMerchantPortalTab] =
    useState<MerchantPortalTab>("profile");
  const [paymentTableFilters, setPaymentTableFilters] =
    useState<PaymentTableFilters>({
      status: "",
      providerCode: "",
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  const [merchantPortalLoading, setMerchantPortalLoading] = useState(false);
  const [merchantPortalAuthMode, setMerchantPortalAuthMode] = useState<
    "login" | "register"
  >("login");
  const [merchantPortalCanSelfRegister, setMerchantPortalCanSelfRegister] =
    useState(false);
  const [merchantPortalName, setMerchantPortalName] = useState("");
  const [merchantPortalEmail, setMerchantPortalEmail] = useState("");
  const [merchantPortalPassword, setMerchantPortalPassword] = useState("");
  const [merchantPortalLoginTwoFactorCode, setMerchantPortalLoginTwoFactorCode] =
    useState("");
  const [merchantSettingsName, setMerchantSettingsName] = useState("");
  const [merchantSettingsEmail, setMerchantSettingsEmail] = useState("");
  const [merchantPortalTwoFactorSetup, setMerchantPortalTwoFactorSetup] =
    useState<MerchantPortalTwoFactorSetup | null>(null);
  const [merchantPortalTwoFactorPassword, setMerchantPortalTwoFactorPassword] =
    useState("");
  const [merchantPortalTwoFactorCode, setMerchantPortalTwoFactorCode] =
    useState("");
  const [merchantPortalTwoFactorDisablePassword, setMerchantPortalTwoFactorDisablePassword] =
    useState("");
  const [merchantPortalTwoFactorDisableCode, setMerchantPortalTwoFactorDisableCode] =
    useState("");
  const [merchantPortalApiKeyPassword, setMerchantPortalApiKeyPassword] =
    useState("");
  const [merchantPortalApiKeyCode, setMerchantPortalApiKeyCode] = useState("");
  const [revealedMerchantPortalApiKey, setRevealedMerchantPortalApiKey] =
    useState("");
  const [merchantUserEmail, setMerchantUserEmail] = useState("");
  const [merchantUserPassword, setMerchantUserPassword] = useState("");
  const [merchantUserRole, setMerchantUserRole] = useState<
    "owner" | "manager" | "readonly"
  >("manager");
  const [merchantUserRoleDrafts, setMerchantUserRoleDrafts] = useState<
    Record<string, string>
  >({});
  const [pspAdminToken, setPspAdminToken] = useState("");
  const [pspAdminUser, setPspAdminUser] = useState<PspAdminUser | null>(null);
  const [pspAdminOverview, setPspAdminOverview] =
    useState<PspAdminOverviewResponse | null>(null);
  const [pspAdminLoading, setPspAdminLoading] = useState(false);
  const [pspAdminAuthMode, setPspAdminAuthMode] = useState<"login" | "register">(
    "login",
  );
  const [pspAdminCanSelfRegister, setPspAdminCanSelfRegister] = useState(false);
  const [pspAdminEmail, setPspAdminEmail] = useState("");
  const [pspAdminPassword, setPspAdminPassword] = useState("");
  const [pspAdminLoginTwoFactorCode, setPspAdminLoginTwoFactorCode] =
    useState("");
  const [pspAdminTab, setPspAdminTab] = useState<PspAdminTab>(
    getStoredPspAdminTab,
  );
  const [pspAdminUsers, setPspAdminUsers] = useState<PspAdminUser[]>([]);
  const [pspAdminAuditLogs, setPspAdminAuditLogs] = useState<AuditLogItem[]>([]);
  const [pspAdminSecurityStatus, setPspAdminSecurityStatus] =
    useState<PspAdminSecurityStatusResponse | null>(null);
  const [pspAdminAuditFilters, setPspAdminAuditFilters] = useState({
    action: "",
    query: "",
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
  });
  const [pspAdminAuditDraftFilters, setPspAdminAuditDraftFilters] = useState({
    action: "",
    query: "",
    sortBy: "createdAt",
    sortOrder: "desc" as "asc" | "desc",
  });
  const [pspAdminAuditPage, setPspAdminAuditPage] = useState(1);
  const [pspAdminPayments, setPspAdminPayments] = useState<PspAdminPaymentItem[]>(
    [],
  );
  const [pspAdminPaymentsPage, setPspAdminPaymentsPage] = useState(1);
  const [pspAdminPaymentsTotalPages, setPspAdminPaymentsTotalPages] =
    useState(1);
  const [pspAdminPaymentsTotalCount, setPspAdminPaymentsTotalCount] =
    useState(0);
  const [pspAdminPaymentFilters, setPspAdminPaymentFilters] =
    useState<PaymentTableFilters>({
      status: "",
      providerCode: "",
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  const [pspAdminPaymentDraftFilters, setPspAdminPaymentDraftFilters] =
    useState<PaymentTableFilters>({
      status: "",
      providerCode: "",
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  const [pspAdminSelectedPayment, setPspAdminSelectedPayment] =
    useState<PspAdminPaymentDetailsResponse | null>(null);
  const [pspAdminActionLoading, setPspAdminActionLoading] = useState(false);
  const [pspAdminCreateUserEmail, setPspAdminCreateUserEmail] = useState("");
  const [pspAdminCreateUserPassword, setPspAdminCreateUserPassword] =
    useState("");
  const [pspAdminCreateUserRole, setPspAdminCreateUserRole] = useState<
    "admin" | "support" | "risk" | "readonly"
  >("support");
  const [revealedMerchantApiKeys, setRevealedMerchantApiKeys] = useState<
    Record<string, string>
  >({});
  const [pspAdminRevealTargetId, setPspAdminRevealTargetId] = useState("");
  const [pspAdminRevealPassword, setPspAdminRevealPassword] = useState("");
  const [pspAdminTwoFactorSetup, setPspAdminTwoFactorSetup] =
    useState<PspAdminTwoFactorSetup | null>(null);
  const [pspAdminTwoFactorPassword, setPspAdminTwoFactorPassword] =
    useState("");
  const [pspAdminTwoFactorCode, setPspAdminTwoFactorCode] = useState("");
  const [pspAdminTwoFactorDisablePassword, setPspAdminTwoFactorDisablePassword] =
    useState("");
  const [pspAdminTwoFactorDisableCode, setPspAdminTwoFactorDisableCode] =
    useState("");
  const [pspAdminRecoveryCodes, setPspAdminRecoveryCodes] = useState<string[]>([]);
  const [pspAdminRecoveryCodePassword, setPspAdminRecoveryCodePassword] =
    useState("");
  const [pspAdminRecoveryCodeTotp, setPspAdminRecoveryCodeTotp] = useState("");
  const hasMerchantPortalSession = merchantPortalToken.trim().length > 0;
  const hasPspAdminSession = pspAdminToken.trim().length > 0;
  const merchantPortalPermissions = merchantPortalProfile?.currentUser?.permissions;

  const merchantAuditActionOptions = [
    "",
    "merchant_portal_registered",
    "merchant_owner_logged_in",
    "merchant_user_logged_in",
    "merchant_profile_updated",
    "merchant_api_key_rotated",
    "merchant_api_key_revealed",
    "merchant_2fa_setup_started",
    "merchant_2fa_enabled",
    "merchant_2fa_disabled",
    "merchant_user_created",
    "merchant_user_deactivated",
    "merchant_user_role_updated",
  ];
  const paymentStatusOptions = [
    "",
    "created",
    "processing",
    "authorized",
    "captured",
    "declined",
    "timeout",
    "error",
    "refunded",
    "canceled",
    "chargeback",
  ];
  const paymentProviderOptions = ["", "mock_bank", "fake_bank", "sandbox_public_checkout"];

  //Сюла будем класть summary c backend
  // Список платежей
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  // Детали выбранного платежа
  const [selectedPayment, setSelectedPayment] =
    useState<PaymentDetailsResponse | null>(null);
  // Текущая страница
  const [page, setPage] = useState(1);

  // Сколько всего страниц
  const [totalPages, setTotalPages] = useState(1);

  //Флаг загрузки
  const [loading, setLoading] = useState(false);

  // Загрузка action-кнопки
  const [actionLoading, setActionLoading] = useState(false);
  //Текст ошибки
  const [error, setError] = useState("");

  // Имя нового мерчанта в форме создания
  const [merchantName, setMerchantName] = useState("");
  const [merchantPortalInviteEmail, setMerchantPortalInviteEmail] = useState("");
  const [merchantPortalInvitePassword, setMerchantPortalInvitePassword] =
    useState("");

  // Флаг создания мерчанта
  const [merchantCreating, setMerchantCreating] = useState(false);

  // Успешно созданный мерчант
  const [createdMerchant, setCreatedMerchant] = useState<{
    id: string;
    name: string;
    email?: string;
    apiKey: string;
  } | null>(null);

  // Данные клиентского checkout
  const [checkoutAmount, setCheckoutAmount] = useState(""); // Сумма клиента
  const [checkoutCurrency, setCheckoutCurrency] = useState("EUR"); // Валюта клиента
  const [checkoutOrderId, setCheckoutOrderId] = useState(() =>
    generateFrontendMerchantOrderId(),
  ); // Внешний id заказа
  const [checkoutCreating, setCheckoutCreating] = useState(false); // Загрузка кнопки
  const [checkoutUrl, setCheckoutUrl] = useState(""); // Ссылка на hosted checkout
  const [checkoutSessionId, setCheckoutSessionId] = useState(""); // id session

  const [stubSessionId, setStubSessionId] = useState("");
  const [stubPaymentId, setStubPaymentId] = useState("");
  const [stubPaying, setStubPaying] = useState(false); // loader кнопки stub-оплаты
  const [stubPaid, setStubPaid] = useState(false); // флаг успешной stub-оплаты

  const PAYMENT_CURRENCIES = ["EUR", "USD", "THB", "RUB"]; // Доступные валюты
  function maskApiKeyValue(value?: string | null) {
    const normalized = String(value || "").trim();

    if (!normalized) {
      return "—";
    }

    if (normalized.length <= 10) {
      return normalized;
    }

    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  }

  function getMerchantPortalAuthHeaders(): Record<string, string> {
    if (!merchantPortalToken.trim() || merchantPortalToken === "__cookie__") {
      return {};
    }

    return {
      Authorization: `Bearer ${merchantPortalToken}`,
    };
  }

  function getPspAdminAuthHeaders(): Record<string, string> {
    if (!pspAdminToken.trim() || pspAdminToken === "__cookie__") {
      return {};
    }

    return {
      Authorization: `Bearer ${pspAdminToken}`,
    };
  }

  function appFetch(input: string, init?: RequestInit) {
    return fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.headers || {}),
      },
    });
  }

  function exportMerchantAuditLogsToCsv() {
    if (!merchantPortalAuditLogs.length) {
      setError("Нет audit log данных для экспорта");
      return;
    }

    const escapeCsv = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [
      ["createdAt", "action", "actorType", "actorId", "entityType", "entityId", "payload"],
      ...merchantPortalAuditLogs.map((log) => [
        log.createdAt,
        log.action,
        log.actorType,
        log.actorId || "",
        log.entityType,
        log.entityId || "",
        JSON.stringify(log.payload || {}),
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `merchant-audit-page-${merchantAuditPagination.page}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  //Пока кнопка просто логирует данные
  const handleLoadData = useCallback(
    async (showLoader = true) => {
      // Если нет ни токена кабинета, ни apiKey — сразу показываем ошибку
      if (!hasMerchantPortalSession && !apiKey.trim()) {
        setError("Введи API-ключ мерчанта");
        return;
      }

      //Перед новым запросом очищаем старую ошибку
      setError("");

      // Включаем состояние загрузки только для ручной загрузки
      if (showLoader) {
        setLoading(true);
      }

      try {
        const listParams = new URLSearchParams({
          limit: "20",
          page: String(page),
        });
        if (paymentTableFilters.status.trim()) {
          listParams.set("status", paymentTableFilters.status.trim());
        }
        if (paymentTableFilters.providerCode.trim()) {
          listParams.set("providerCode", paymentTableFilters.providerCode.trim());
        }
        if (paymentTableFilters.search.trim()) {
          listParams.set("search", paymentTableFilters.search.trim());
        }
        listParams.set("sortBy", paymentTableFilters.sortBy);
        listParams.set("sortOrder", paymentTableFilters.sortOrder);

        const paymentsResponse = hasMerchantPortalSession
          ? await appFetch(
              `${apiBase}/merchant/portal/payments/list?${listParams.toString()}`,
              {
                headers: getMerchantPortalAuthHeaders(),
              },
            )
          : await fetch(`${apiBase}/payments/list`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                apiKey: apiKey,
                limit: 20, // По 20 платежей на страницу
                page: page, // Берём текущую страницу из state
                status: paymentTableFilters.status || undefined,
                providerCode: paymentTableFilters.providerCode || undefined,
                search: paymentTableFilters.search || undefined,
                sortBy: paymentTableFilters.sortBy,
                sortOrder: paymentTableFilters.sortOrder,
              }),
            });

        const paymentsJson = await paymentsResponse.json();

        if (!paymentsResponse.ok) {
          throw new Error(
            paymentsJson.message || "Ошибка загрузки списка платежей",
          );
        }

        //Сохраняем список платежей
        setPayments(paymentsJson.items || []);
        // Сохраняем количество страниц
        setTotalPages(paymentsJson.totalPages || 1);
      } catch (err) {
        //Если была ошибка - показываем текст
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      } finally {
        //В любом случае выключаем загрузку
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [
      apiBase,
      apiKey,
      page,
      hasMerchantPortalSession,
      merchantPortalToken,
      paymentTableFilters.status,
      paymentTableFilters.providerCode,
      paymentTableFilters.search,
      paymentTableFilters.sortBy,
      paymentTableFilters.sortOrder,
    ],
  );

  const handleSelectPayment = useCallback(
    async (paymentId: string) => {
      // Перед новым запросом чистим старую ошибку
      setError("");

      try {
        const response = hasMerchantPortalSession
          ? await appFetch(`${apiBase}/merchant/portal/payment/details/${paymentId}`, {
              headers: getMerchantPortalAuthHeaders(),
            })
          : await fetch(`${apiBase}/payment/details`, {
              method: "POST", // POST-запрос
              headers: {
                "Content-Type": "application/json", // JSON body
              },
              body: JSON.stringify({
                apiKey: apiKey, // передаём apiKey
                paymentId: paymentId, // id выбранного платежа
              }),
            });

        // Читаем JSON
        const data = await response.json();

        // Если backend вернул ошибку — кидаем её
        if (!response.ok) {
          throw new Error(data.message || "Ошибка загрузки деталей платежа");
        }

        // Сохраняем детали в state
        setSelectedPayment(data);
      } catch (err) {
        // Показываем ошибку
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить детали платежа",
        );
      }
    },
    [apiBase, apiKey, hasMerchantPortalSession, merchantPortalToken],
  );

  function renderPayload(payload: Record<string, unknown>) {
    const rows = getAuditPayloadRows(payload);

    if (!rows.length) {
      return <p className="payload-empty">Нет данных</p>;
    }

    return (
      <div className="payload-list">
        {rows.map((row) => (
          <div key={row.key} className="payload-row">
            <span className="payload-key">{row.key}</span>
            <span className="payload-value">{row.value}</span>
          </div>
        ))}
      </div>
    );
  }
  async function handleProcessPayment() {
    //Если платеж не выбран - ничего не делаем
    if (!selectedPayment) {
      return;
    }

    //Чистим старую ошибку
    setError("");

    //Включаем загрузку кнопки
    setActionLoading(true);

    try {
      //делаем запрос в backend
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/process`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/process`, {
            method: "POST", //POST-запрос
            headers: {
              "Content-Type": "application/json", //JSON body
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id, //id текущего выбранного платежа
            }),
          });

      //Читаем JSON
      const data = await response.json();

      //Если backend вернул ошиюку - кидаем её
      if (!response.ok) {
        throw new Error(data.message || "Ошибка process");
      }
      //После успешного process обновляем общий экран
      await handleLoadData();

      //Заново подгружаем детали этого же платежа
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      //Показываем огибку
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить process",
      );
    } finally {
      //Выключаем загрузку кнопки
      setActionLoading(false);
    }
  }

  async function handleRetryPayment() {
    // Если платеж не выбран — ничего не делаем
    if (!selectedPayment) {
      return;
    }

    // Чистим старую ошибку
    setError("");

    // Включаем загрузку action-кнопки
    setActionLoading(true);

    try {
      // Отправляем retry в backend
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/retry`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/retry`, {
            method: "POST", // POST-запрос
            headers: {
              "Content-Type": "application/json", // JSON body
            },
            body: JSON.stringify({
              apiKey: apiKey, // Для retry backend ждёт apiKey
              paymentId: selectedPayment.payment.id, // id текущего платежа
            }),
          });

      // Читаем JSON
      const data = await response.json();

      // Если backend вернул ошибку — кидаем её
      if (!response.ok) {
        throw new Error(data.message || "Ошибка retry");
      }

      // Обновляем общий экран
      await handleLoadData();

      // И заново подгружаем детали этого же платежа
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      // Показываем ошибку
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить retry",
      );
    } finally {
      // Выключаем загрузку
      setActionLoading(false);
    }
  }

  async function handleCapturePayment() {
    // Если платеж не выбран — выходим
    if (!selectedPayment) {
      return;
    }

    // Чистим старую ошибку
    setError("");

    // Включаем загрузку action-кнопки
    setActionLoading(true);

    try {
      // Отправляем capture в backend
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/capture`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/capture`, {
            method: "POST", // POST-запрос
            headers: {
              "Content-Type": "application/json", // JSON body
            },
            body: JSON.stringify({
              apiKey: apiKey, // Для capture backend ждёт apiKey
              paymentId: selectedPayment.payment.id, // id текущего платежа
            }),
          });

      // Читаем JSON
      const data = await response.json();

      // Если backend вернул ошибку — кидаем её
      if (!response.ok) {
        throw new Error(data.message || "Ошибка capture");
      }

      // Обновляем общий экран
      await handleLoadData();

      // И заново подгружаем детали этого же платежа
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      // Показываем ошибку
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить capture",
      );
    } finally {
      // Выключаем загрузку
      setActionLoading(false);
    }
  }

  async function handleRefundPayment() {
    if (!selectedPayment) {
      return;
    }

    setError("");
    setActionLoading(true);

    try {
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/refund`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/refund`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: apiKey,
              paymentId: selectedPayment.payment.id,
            }),
          });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка refund");
      }

      await handleLoadData();
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить возврат",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelPayment() {
    if (!selectedPayment) {
      return;
    }

    setError("");
    setActionLoading(true);

    try {
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: apiKey,
              paymentId: selectedPayment.payment.id,
            }),
          });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка cancel");
      }

      await handleLoadData();
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось отменить платёж",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleChargebackPayment() {
    if (!selectedPayment) {
      return;
    }

    setError("");
    setActionLoading(true);

    try {
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/chargeback`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/chargeback`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: apiKey,
              paymentId: selectedPayment.payment.id,
            }),
          });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка chargeback");
      }

      await handleLoadData();
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось выполнить чарджбэк",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSimulateChargebackPayment() {
    if (!selectedPayment) {
      return;
    }

    setError("");
    setActionLoading(true);

    try {
      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/payment/simulate-chargeback`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: selectedPayment.payment.id,
            }),
          })
        : await fetch(`${apiBase}/payment/simulate-chargeback`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: apiKey,
              paymentId: selectedPayment.payment.id,
            }),
          });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка simulate chargeback");
      }

      await handleLoadData();
      await handleSelectPayment(selectedPayment.payment.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось симулировать внешний чарджбэк",
      );
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    const isMerchantPaymentsTabActive =
      activePage === "merchant_portal" && merchantPortalTab === "payments";

    if (
      !isMerchantPaymentsTabActive ||
      (!hasMerchantPortalSession && !apiKey.trim())
    ) {
      return;
    }

    // Смотрим статус выбранного платежа
    const currentStatus = selectedPayment?.payment.status?.toLowerCase();

    // Polling нужен, если:
    // 1) сейчас идёт action-кнопка
    // 2) или выбранный платёж в "живом" статусе
    const shouldPollSelected =
      !!selectedPayment?.payment.id &&
      ["created", "processing", "authorized", "timeout", "error"].includes(
        currentStatus || "",
      );

    if (!actionLoading && !shouldPollSelected) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      // Тихо обновляем summary и таблицу
      await handleLoadData(false);

      // Если открыт платёж — обновляем и детали
      if (selectedPayment?.payment.id) {
        await handleSelectPayment(selectedPayment.payment.id);
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [
    activePage,
    merchantPortalTab,
    apiKey,
    hasMerchantPortalSession,
    actionLoading,
    selectedPayment?.payment.id,
    selectedPayment?.payment.status,
    handleLoadData,
    handleSelectPayment,
  ]);

  useEffect(() => {
    const isMerchantPaymentsTabActive =
      activePage === "merchant_portal" && merchantPortalTab === "payments";

    if (
      !isMerchantPaymentsTabActive ||
      (!hasMerchantPortalSession && !apiKey.trim())
    ) {
      return;
    }

    const currentStatus = selectedPayment?.payment.status?.toLowerCase();
    const shouldPollSelected =
      !!selectedPayment?.payment.id &&
      ["created", "processing", "authorized", "timeout", "error"].includes(
        currentStatus || "",
      );

    if (actionLoading || shouldPollSelected) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      await handleLoadData(false);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [
    activePage,
    merchantPortalTab,
    apiKey,
    hasMerchantPortalSession,
    actionLoading,
    selectedPayment?.payment.id,
    selectedPayment?.payment.status,
    handleLoadData,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const pageFromUrl = params.get("page");
    const sessionIdFromUrl = params.get("sessionId");
    const paymentIdFromUrl = params.get("paymentId");

    if (pageFromUrl === "public_checkout") {
      setActivePage("public_checkout");
      setError("");
      return;
    }

    if (pageFromUrl === "checkout_stub") {
      setActivePage("checkout_stub");
      setStubSessionId(sessionIdFromUrl || "");
      setStubPaymentId(paymentIdFromUrl || "");
      setStubPaid(false);
      setError("");
    }
  }, []);

  useEffect(() => {
    if (apiKey.trim()) {
      window.localStorage.setItem("psp_api_key", apiKey);
      return;
    }
    window.localStorage.removeItem("psp_api_key");
  }, [apiKey]);

  useEffect(() => {
    if (apiBase.trim()) {
      window.localStorage.setItem("psp_api_base", apiBase);
      return;
    }
    window.localStorage.removeItem("psp_api_base");
  }, [apiBase]);

  useEffect(() => {
    const storedApiBase = window.localStorage.getItem("psp_api_base");

    if (storedApiBase?.trim()) {
      setApiBase(storedApiBase);
      return;
    }
    setApiBase(defaultApiBase);
  }, [defaultApiBase]);

  useEffect(() => {
    async function restoreSessions() {
      try {
        const adminResponse = await appFetch(`${apiBase}/admin/portal/me`);

        if (adminResponse.ok) {
          const adminJson = await adminResponse.json();
          setPspAdminToken("__cookie__");
          setPspAdminUser(adminJson.user || null);
          return;
        }
      } catch {
        // ignore restore errors
      }

      try {
        const merchantResponse = await appFetch(`${apiBase}/merchant/portal/me`);

        if (merchantResponse.ok) {
          const merchantJson = await merchantResponse.json();
          setMerchantPortalToken("__cookie__");
          setMerchantPortalProfile(merchantJson.merchant || null);
        }
      } catch {
        // ignore restore errors
      }
    }

    void restoreSessions();
  }, [apiBase]);

  const handleLoadMerchantPortalOverview = useCallback(async () => {
    if (!merchantPortalToken.trim()) {
      setMerchantPortalProfile(null);
      setMerchantPortalOverview(null);
      setMerchantPortalUsers([]);
      setMerchantPortalAuditLogs([]);
      setPayments([]);
      setSelectedPayment(null);
      setMerchantAuditPagination({
        page: 1,
        totalPages: 1,
        totalCount: 0,
      });
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const [meResponse, overviewResponse] = await Promise.all([
        appFetch(`${apiBase}/merchant/portal/me`, {
          headers: {
            ...getMerchantPortalAuthHeaders(),
          },
        }),
        appFetch(`${apiBase}/merchant/portal/overview`, {
          headers: {
            ...getMerchantPortalAuthHeaders(),
          },
        }),
      ]);

      const meJson = await meResponse.json();
      const overviewJson = await overviewResponse.json();

      if (!meResponse.ok) {
        throw new Error(meJson.message || "Ошибка загрузки профиля мерчанта");
      }

      if (!overviewResponse.ok) {
        throw new Error(
          overviewJson.message || "Ошибка загрузки overview мерчанта",
        );
      }

      setMerchantPortalProfile(meJson.merchant || null);
      setMerchantPortalOverview(overviewJson);
      await handleLoadData(false);

      if (meJson.merchant?.currentUser?.permissions?.canManageMerchantUsers) {
        const usersResponse = await appFetch(`${apiBase}/merchant/portal/users`, {
          headers: {
            ...getMerchantPortalAuthHeaders(),
          },
        });
        const usersJson = await usersResponse.json();

        if (!usersResponse.ok) {
          throw new Error(usersJson.message || "Ошибка загрузки команды мерчанта");
        }

        setMerchantPortalUsers(usersJson.items || []);
        setMerchantUserRoleDrafts(
          Object.fromEntries(
            (usersJson.items || []).map((user: MerchantTeamUser) => [user.id, user.role]),
          ),
        );
      } else {
        setMerchantPortalUsers([]);
        setMerchantUserRoleDrafts({});
      }

      if (meJson.merchant?.currentUser?.permissions?.canViewMerchantAudit) {
        const auditParams = new URLSearchParams();

        if (merchantAuditFilters.action.trim()) {
          auditParams.set("action", merchantAuditFilters.action.trim());
        }

        if (merchantAuditFilters.query.trim()) {
          auditParams.set("query", merchantAuditFilters.query.trim());
        }

        if (merchantAuditFilters.dateFrom.trim()) {
          auditParams.set("dateFrom", merchantAuditFilters.dateFrom.trim());
        }

        if (merchantAuditFilters.dateTo.trim()) {
          auditParams.set("dateTo", merchantAuditFilters.dateTo.trim());
        }
        auditParams.set("sortBy", merchantAuditFilters.sortBy);
        auditParams.set("sortOrder", merchantAuditFilters.sortOrder);
        auditParams.set("page", String(merchantAuditPagination.page));
        auditParams.set("limit", "20");

        const auditResponse = await appFetch(
          `${apiBase}/merchant/portal/audit-logs${auditParams.toString() ? `?${auditParams.toString()}` : ""}`,
          {
            headers: {
              ...getMerchantPortalAuthHeaders(),
            },
          },
        );
        const auditJson = await auditResponse.json();

        if (!auditResponse.ok) {
          throw new Error(auditJson.message || "Ошибка загрузки audit log мерчанта");
        }

        setMerchantPortalAuditLogs(auditJson.items || []);
        setMerchantAuditPagination({
          page: Number(auditJson.page || 1),
          totalPages: Number(auditJson.totalPages || 1),
          totalCount: Number(auditJson.totalCount || 0),
        });
      } else {
        setMerchantPortalAuditLogs([]);
        setMerchantAuditPagination({
          page: 1,
          totalPages: 1,
          totalCount: 0,
        });
      }
    } catch (err) {
      setMerchantPortalToken("");
      setMerchantPortalProfile(null);
      setMerchantPortalOverview(null);
      setMerchantPortalUsers([]);
      setMerchantPortalAuditLogs([]);
      setPayments([]);
      setSelectedPayment(null);
      setMerchantAuditPagination({
        page: 1,
        totalPages: 1,
        totalCount: 0,
      });
      setMerchantUserRoleDrafts({});
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось загрузить кабинет мерчанта",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }, [
    apiBase,
    merchantPortalToken,
    merchantAuditFilters.action,
    merchantAuditFilters.query,
    merchantAuditFilters.dateFrom,
    merchantAuditFilters.dateTo,
    merchantAuditFilters.sortBy,
    merchantAuditFilters.sortOrder,
    merchantAuditPagination.page,
    handleLoadData,
  ]);

  useEffect(() => {
    if (!hasMerchantPortalSession && !apiKey.trim()) {
      return;
    }

    void handleLoadData(false);
  }, [page, handleLoadData, hasMerchantPortalSession, apiKey]);

  useEffect(() => {
    if (!merchantPortalToken.trim()) {
      return;
    }

    void handleLoadMerchantPortalOverview();
  }, [merchantPortalToken, handleLoadMerchantPortalOverview]);

  useEffect(() => {
    setMerchantSettingsName(merchantPortalProfile?.name || "");
    setMerchantSettingsEmail(merchantPortalProfile?.email || "");
  }, [merchantPortalProfile]);

  const handleLoadBootstrapStatuses = useCallback(async () => {
    try {
      const [merchantBootstrapResponse, pspBootstrapResponse] = await Promise.all([
        appFetch(`${apiBase}/merchant/portal/bootstrap-status`),
        appFetch(`${apiBase}/admin/portal/bootstrap-status`),
      ]);

      const merchantBootstrapJson =
        (await merchantBootstrapResponse.json()) as BootstrapStatusResponse;
      const pspBootstrapJson =
        (await pspBootstrapResponse.json()) as BootstrapStatusResponse;

      if (merchantBootstrapResponse.ok) {
        setMerchantPortalCanSelfRegister(
          Boolean(merchantBootstrapJson.canSelfRegister),
        );
      }

      if (pspBootstrapResponse.ok) {
        setPspAdminCanSelfRegister(Boolean(pspBootstrapJson.canSelfRegister));
      }
    } catch {
      setMerchantPortalCanSelfRegister(false);
      setPspAdminCanSelfRegister(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void handleLoadBootstrapStatuses();
  }, [handleLoadBootstrapStatuses]);

  useEffect(() => {
    if (!merchantPortalCanSelfRegister && merchantPortalAuthMode === "register") {
      setMerchantPortalAuthMode("login");
    }
  }, [merchantPortalAuthMode, merchantPortalCanSelfRegister]);

  useEffect(() => {
    if (!pspAdminCanSelfRegister && pspAdminAuthMode === "register") {
      setPspAdminAuthMode("login");
    }
  }, [pspAdminAuthMode, pspAdminCanSelfRegister]);

  const handleLoadPspAdminOverview = useCallback(async () => {
    if (!pspAdminToken.trim()) {
      setPspAdminUser(null);
      setPspAdminOverview(null);
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const meResponse = await appFetch(`${apiBase}/admin/portal/me`, {
        headers: getPspAdminAuthHeaders(),
      });
      const meJson = await meResponse.json();

      if (!meResponse.ok) {
        throw new Error(meJson.message || "Ошибка загрузки профиля PSP admin");
      }

      const adminUser = meJson.user as PspAdminUser;

      const overviewResponse = await appFetch(`${apiBase}/admin/portal/overview`, {
        headers: getPspAdminAuthHeaders(),
      });
      const overviewJson = await overviewResponse.json();

      if (!overviewResponse.ok) {
        throw new Error(overviewJson.message || "Ошибка загрузки overview PSP");
      }

      let usersItems: PspAdminUser[] = [];
      let auditLogItems: AuditLogItem[] = [];
      let securityStatus: PspAdminSecurityStatusResponse | null = null;

      if (adminUser.permissions.canViewPspUsers) {
        const usersResponse = await appFetch(`${apiBase}/admin/portal/users`, {
          headers: getPspAdminAuthHeaders(),
        });
        const usersJson = await usersResponse.json();

        if (!usersResponse.ok) {
          throw new Error(usersJson.message || "Ошибка загрузки PSP users");
        }

        usersItems = usersJson.items || [];
      }

      if (adminUser.permissions.canViewAuditLogs) {
        const auditLogsResponse = await appFetch(
          `${apiBase}/admin/portal/audit-logs`,
          {
            headers: getPspAdminAuthHeaders(),
          },
        );
        const auditLogsJson = await auditLogsResponse.json();

        if (!auditLogsResponse.ok) {
          throw new Error(auditLogsJson.message || "Ошибка загрузки audit logs");
        }

        auditLogItems = auditLogsJson.items || [];
      }

      if (adminUser.permissions.canViewSecurityStatus) {
        const securityStatusResponse = await appFetch(
          `${apiBase}/admin/portal/security/status`,
          {
            headers: getPspAdminAuthHeaders(),
          },
        );
        const securityStatusJson = await securityStatusResponse.json();

        if (!securityStatusResponse.ok) {
          throw new Error(
            securityStatusJson.message || "Ошибка загрузки security status",
          );
        }

        securityStatus = securityStatusJson;
      }

      setPspAdminUser(adminUser || null);
      setPspAdminOverview(overviewJson);
      setPspAdminUsers(usersItems);
      setPspAdminAuditLogs(auditLogItems);
      setPspAdminSecurityStatus(securityStatus);
    } catch (err) {
      setPspAdminToken("");
      setPspAdminUser(null);
      setPspAdminOverview(null);
      setPspAdminUsers([]);
      setPspAdminAuditLogs([]);
      setPspAdminSecurityStatus(null);
      setRevealedMerchantApiKeys({});
      setPspAdminRevealTargetId("");
      setPspAdminRevealPassword("");
      setPspAdminTwoFactorSetup(null);
      setPspAdminTwoFactorPassword("");
      setPspAdminTwoFactorCode("");
      setPspAdminTwoFactorDisablePassword("");
      setPspAdminTwoFactorDisableCode("");
      setPspAdminRecoveryCodes([]);
      setPspAdminRecoveryCodePassword("");
      setPspAdminRecoveryCodeTotp("");
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось загрузить кабинет PSP",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }, [apiBase, pspAdminToken]);

  const handleLoadPspAdminPayments = useCallback(async () => {
    if (!pspAdminToken.trim()) {
      setPspAdminPayments([]);
      setPspAdminPaymentsPage(1);
      setPspAdminPaymentsTotalPages(1);
      setPspAdminPaymentsTotalCount(0);
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(pspAdminPaymentsPage));
      params.set("limit", "20");

      if (pspAdminPaymentFilters.status.trim()) {
        params.set("status", pspAdminPaymentFilters.status.trim());
      }

      if (pspAdminPaymentFilters.providerCode.trim()) {
        params.set("providerCode", pspAdminPaymentFilters.providerCode.trim());
      }

      if (pspAdminPaymentFilters.search.trim()) {
        params.set("search", pspAdminPaymentFilters.search.trim());
      }

      params.set("sortBy", pspAdminPaymentFilters.sortBy);
      params.set("sortOrder", pspAdminPaymentFilters.sortOrder);

      const response = await appFetch(
        `${apiBase}/admin/portal/payments?${params.toString()}`,
        {
          headers: getPspAdminAuthHeaders(),
        },
      );
      const json = (await response.json()) as PspAdminPaymentsResponse & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(json.message || "Ошибка загрузки платежей PSP");
      }

      setPspAdminPayments(json.items || []);
      setPspAdminPaymentsPage(Number(json.page || 1));
      setPspAdminPaymentsTotalPages(Number(json.totalPages || 1));
      setPspAdminPaymentsTotalCount(Number(json.totalCount || 0));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить платежи PSP",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }, [
    apiBase,
    pspAdminToken,
    pspAdminPaymentsPage,
    pspAdminPaymentFilters.status,
    pspAdminPaymentFilters.providerCode,
    pspAdminPaymentFilters.search,
    pspAdminPaymentFilters.sortBy,
    pspAdminPaymentFilters.sortOrder,
  ]);

  const handleSelectPspAdminPayment = useCallback(
    async (paymentId: string) => {
      if (!pspAdminToken.trim()) {
        return;
      }

      setError("");

      try {
        const response = await appFetch(
          `${apiBase}/admin/portal/payment/details/${paymentId}`,
          {
            headers: getPspAdminAuthHeaders(),
          },
        );
        const data = (await response.json()) as
          | (PspAdminPaymentDetailsResponse & { message?: string })
          | { message?: string };

        if (!response.ok) {
          throw new Error(data.message || "Ошибка загрузки деталей платежа PSP");
        }

        setPspAdminSelectedPayment(data as PspAdminPaymentDetailsResponse);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить детали платежа PSP",
        );
      }
    },
    [apiBase, pspAdminToken],
  );

  const handlePspAdminPaymentAction = useCallback(
    async (
      endpoint:
        | "process"
        | "retry"
        | "capture"
        | "refund"
        | "cancel"
        | "chargeback"
        | "simulate-chargeback",
      errorMessage: string,
    ) => {
      if (!pspAdminSelectedPayment?.payment.id) {
        return;
      }

      setError("");
      setPspAdminActionLoading(true);

      try {
        const response = await appFetch(
          `${apiBase}/admin/portal/payment/${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getPspAdminAuthHeaders(),
            },
            body: JSON.stringify({
              paymentId: pspAdminSelectedPayment.payment.id,
            }),
          },
        );
        const data = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(data.message || errorMessage);
        }

        await handleLoadPspAdminPayments();
        await handleSelectPspAdminPayment(pspAdminSelectedPayment.payment.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : errorMessage);
      } finally {
        setPspAdminActionLoading(false);
      }
    },
    [apiBase, pspAdminSelectedPayment, handleLoadPspAdminPayments, handleSelectPspAdminPayment],
  );

  useEffect(() => {
    if (!pspAdminToken.trim()) {
      return;
    }

    void handleLoadPspAdminOverview();
  }, [pspAdminToken, handleLoadPspAdminOverview]);

  useEffect(() => {
    localStorage.setItem("psp_admin_tab", pspAdminTab);
  }, [pspAdminTab]);

  useEffect(() => {
    if (!pspAdminUser?.permissions) {
      return;
    }

    const permissions = pspAdminUser.permissions;
    const currentTabAllowed =
      (pspAdminTab === "payments" && permissions.canViewPayments) ||
      (pspAdminTab === "audit" && permissions.canViewAuditLogs) ||
      (pspAdminTab === "merchants" && permissions.canViewMerchants) ||
      (pspAdminTab === "users" && permissions.canViewPspUsers) ||
      (pspAdminTab === "security" &&
        (permissions.canManageOwnTwoFactor || permissions.canViewSecurityStatus));

    if (!currentTabAllowed) {
      setPspAdminTab(getFirstAvailablePspAdminTab(permissions));
    }
  }, [pspAdminTab, pspAdminUser]);

  useEffect(() => {
    if (
      !pspAdminToken.trim() ||
      activePage !== "psp_admin" ||
      pspAdminTab !== "payments"
    ) {
      return;
    }

    void handleLoadPspAdminPayments();
  }, [
    activePage,
    pspAdminToken,
    pspAdminTab,
    handleLoadPspAdminPayments,
  ]);

  useEffect(() => {
    if (
      !pspAdminToken.trim() ||
      activePage !== "psp_admin" ||
      pspAdminTab !== "payments"
    ) {
      return;
    }

    const currentStatus = pspAdminSelectedPayment?.payment.status?.toLowerCase();
    const shouldPollSelected =
      !!pspAdminSelectedPayment?.payment.id &&
      ["created", "processing", "authorized", "timeout", "error"].includes(
        currentStatus || "",
      );

    if (!pspAdminActionLoading && !shouldPollSelected) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      await handleLoadPspAdminPayments();

      if (pspAdminSelectedPayment?.payment.id) {
        await handleSelectPspAdminPayment(pspAdminSelectedPayment.payment.id);
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [
    activePage,
    pspAdminToken,
    pspAdminTab,
    pspAdminActionLoading,
    pspAdminSelectedPayment?.payment.id,
    pspAdminSelectedPayment?.payment.status,
    handleLoadPspAdminPayments,
    handleSelectPspAdminPayment,
  ]);

  useEffect(() => {
    setError("");
  }, [activePage, merchantPortalTab, pspAdminTab]);

  useEffect(() => {
    const isPspPaymentsTabActive =
      activePage === "psp_admin" && pspAdminTab === "payments";

    if (!pspAdminToken.trim() || !isPspPaymentsTabActive) {
      return;
    }

    const currentStatus = pspAdminSelectedPayment?.payment.status?.toLowerCase();
    const shouldPollSelected =
      !!pspAdminSelectedPayment?.payment.id &&
      ["created", "processing", "authorized", "timeout", "error"].includes(
        currentStatus || "",
      );

    if (pspAdminActionLoading || shouldPollSelected) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      await handleLoadPspAdminPayments();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [
    activePage,
    pspAdminToken,
    pspAdminTab,
    pspAdminActionLoading,
    pspAdminSelectedPayment?.payment.id,
    pspAdminSelectedPayment?.payment.status,
    handleLoadPspAdminPayments,
  ]);

  async function handleMerchantPortalAuth() {
    const normalizedEmail = merchantPortalEmail.trim().toLowerCase();

    if (!normalizedEmail || !merchantPortalPassword.trim()) {
      setError("Заполни email и пароль мерчанта");
      return;
    }

    if (merchantPortalAuthMode === "register" && !merchantPortalName.trim()) {
      setError("Заполни название мерчанта");
      return;
    }

    if (merchantPortalAuthMode === "register" && !merchantPortalCanSelfRegister) {
      setError(
        "Публичная регистрация мерчанта закрыта. Новых мерчантов должен создавать PSP admin",
      );
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const endpoint =
        merchantPortalAuthMode === "login"
          ? "/merchant/portal/login"
          : "/merchant/portal/register";

      const response = await appFetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: merchantPortalName.trim(),
          email: normalizedEmail,
          password: merchantPortalPassword,
          twoFactorCode: merchantPortalLoginTwoFactorCode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка авторизации мерчанта");
      }

      setPspAdminToken("");
      setPspAdminUser(null);
      setPspAdminOverview(null);
      setMerchantPortalToken("__cookie__");
      setMerchantPortalProfile(data.merchant || null);
      setMerchantPortalPassword("");
      setMerchantPortalLoginTwoFactorCode("");
      setActivePage("merchant_portal");
      void handleLoadBootstrapStatuses();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось выполнить вход мерчанта",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleMerchantPortalLogout() {
    await appFetch(`${apiBase}/merchant/portal/logout`, {
      method: "POST",
    });
    setMerchantPortalToken("");
    setMerchantPortalProfile(null);
    setMerchantPortalOverview(null);
    setMerchantPortalPassword("");
    setMerchantPortalLoginTwoFactorCode("");
    setMerchantPortalTwoFactorSetup(null);
    setMerchantPortalTwoFactorPassword("");
    setMerchantPortalTwoFactorCode("");
    setMerchantPortalTwoFactorDisablePassword("");
    setMerchantPortalTwoFactorDisableCode("");
    setMerchantPortalApiKeyPassword("");
    setMerchantPortalApiKeyCode("");
    setRevealedMerchantPortalApiKey("");
    setError("");
  }

  async function handleMerchantProfileSave() {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    if (!merchantSettingsName.trim() || !merchantSettingsEmail.trim()) {
      setError("Заполни название и email мерчанта");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          name: merchantSettingsName.trim(),
          email: merchantSettingsEmail.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось обновить профиль мерчанта");
      }

      setMerchantPortalToken("__cookie__");
      setMerchantPortalProfile(data.merchant || null);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось обновить профиль мерчанта",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleRotateMerchantApiKey() {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    if (!merchantPortalApiKeyPassword.trim() || !merchantPortalApiKeyCode.trim()) {
      setError("Для ротации API-ключа нужны пароль и текущий 2FA код");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(
        `${apiBase}/merchant/portal/rotate-api-key`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          password: merchantPortalApiKeyPassword,
          code: merchantPortalApiKeyCode.trim(),
        }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось ротировать API-ключ");
      }

      setMerchantPortalProfile(data.merchant || null);
      setRevealedMerchantPortalApiKey("");
      setMerchantPortalApiKeyPassword("");
      setMerchantPortalApiKeyCode("");
      setMerchantPortalOverview((current) =>
        current
          ? {
              ...current,
              merchant: data.merchant || current.merchant,
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось ротировать API-ключ",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleRevealMerchantApiKey() {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    if (!merchantPortalApiKeyPassword.trim() || !merchantPortalApiKeyCode.trim()) {
      setError("Для показа API-ключа нужны пароль и текущий 2FA код");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/reveal-api-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          password: merchantPortalApiKeyPassword,
          code: merchantPortalApiKeyCode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось показать API-ключ");
      }

      setRevealedMerchantPortalApiKey(data.apiKey || "");
      setMerchantPortalApiKeyPassword("");
      setMerchantPortalApiKeyCode("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось показать API-ключ",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleStartMerchantPortalTwoFactorSetup() {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/2fa/setup`, {
        method: "POST",
        headers: {
          ...getMerchantPortalAuthHeaders(),
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось начать настройку 2FA");
      }

      setMerchantPortalTwoFactorSetup(data);
      setMerchantPortalTwoFactorPassword("");
      setMerchantPortalTwoFactorCode("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось начать настройку 2FA",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleEnableMerchantPortalTwoFactor() {
    if (!merchantPortalTwoFactorSetup) {
      setError("Сначала запусти настройку 2FA");
      return;
    }

    if (!merchantPortalTwoFactorPassword.trim() || !merchantPortalTwoFactorCode.trim()) {
      setError("Для включения 2FA нужны пароль и 6-значный код");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/2fa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          password: merchantPortalTwoFactorPassword,
          code: merchantPortalTwoFactorCode.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось включить 2FA");
      }

      setMerchantPortalProfile(data.merchant || null);
      setMerchantPortalTwoFactorSetup(null);
      setMerchantPortalTwoFactorPassword("");
      setMerchantPortalTwoFactorCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось включить 2FA");
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleDisableMerchantPortalTwoFactor() {
    if (!merchantPortalTwoFactorDisablePassword.trim() || !merchantPortalTwoFactorDisableCode.trim()) {
      setError("Для отключения 2FA нужны пароль и 6-значный код");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/2fa/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          password: merchantPortalTwoFactorDisablePassword,
          code: merchantPortalTwoFactorDisableCode.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось отключить 2FA");
      }

      setMerchantPortalProfile(data.merchant || null);
      setMerchantPortalTwoFactorDisablePassword("");
      setMerchantPortalTwoFactorDisableCode("");
      setMerchantPortalTwoFactorSetup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить 2FA");
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleCreateMerchantUser() {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    if (!merchantUserEmail.trim() || !merchantUserPassword.trim()) {
      setError("Заполни email и пароль пользователя мерчанта");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/merchant/portal/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getMerchantPortalAuthHeaders(),
        },
        body: JSON.stringify({
          email: merchantUserEmail.trim().toLowerCase(),
          password: merchantUserPassword,
          role: merchantUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось создать пользователя мерчанта");
      }

      setMerchantUserEmail("");
      setMerchantUserPassword("");
      setMerchantUserRole("manager");
      await handleLoadMerchantPortalOverview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать пользователя мерчанта",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleDeactivateMerchantUser(userId: string) {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(
        `${apiBase}/merchant/portal/users/${userId}/deactivate`,
        {
          method: "PATCH",
          headers: {
            ...getMerchantPortalAuthHeaders(),
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось деактивировать пользователя");
      }

      await handleLoadMerchantPortalOverview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось деактивировать пользователя",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handleUpdateMerchantUserRole(userId: string) {
    if (!hasMerchantPortalSession) {
      setError("Сначала войди в кабинет мерчанта");
      return;
    }

    const nextRole = merchantUserRoleDrafts[userId];

    if (!nextRole) {
      setError("Выбери новую роль пользователя");
      return;
    }

    setMerchantPortalLoading(true);
    setError("");

    try {
      const response = await appFetch(
        `${apiBase}/merchant/portal/users/${userId}/role`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getMerchantPortalAuthHeaders(),
          },
          body: JSON.stringify({
            role: nextRole,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось обновить роль пользователя");
      }

      await handleLoadMerchantPortalOverview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось обновить роль пользователя",
      );
    } finally {
      setMerchantPortalLoading(false);
    }
  }

  async function handlePspAdminAuth() {
    if (!pspAdminEmail.trim() || !pspAdminPassword.trim()) {
      setError("Заполни email и пароль PSP admin");
      return;
    }

    if (pspAdminAuthMode === "register" && !pspAdminCanSelfRegister) {
      setError("Bootstrap-регистрация PSP admin уже закрыта");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const endpoint =
        pspAdminAuthMode === "login"
          ? "/admin/portal/login"
          : "/admin/portal/register";

      const response = await appFetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: pspAdminEmail.trim(),
          password: pspAdminPassword,
          twoFactorCode:
            pspAdminAuthMode === "login"
              ? pspAdminLoginTwoFactorCode.trim()
              : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ошибка авторизации PSP admin");
      }

      setMerchantPortalToken("");
      setMerchantPortalProfile(null);
      setMerchantPortalOverview(null);
      setPspAdminToken("__cookie__");
      setPspAdminUser(data.user || null);
      setPspAdminPassword("");
      setPspAdminLoginTwoFactorCode("");
      setPspAdminTab(getFirstAvailablePspAdminTab(data.user?.permissions));
      setPspAdminAuditPage(1);
      setActivePage("psp_admin");
      void handleLoadBootstrapStatuses();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось войти в PSP admin",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handlePspAdminLogout() {
    await appFetch(`${apiBase}/admin/portal/logout`, {
      method: "POST",
    });
    setPspAdminToken("");
    setPspAdminUser(null);
    setPspAdminOverview(null);
    setPspAdminUsers([]);
    setPspAdminAuditLogs([]);
    setPspAdminSecurityStatus(null);
    setRevealedMerchantApiKeys({});
    setPspAdminRevealTargetId("");
    setPspAdminRevealPassword("");
    setPspAdminPassword("");
    setPspAdminLoginTwoFactorCode("");
    setPspAdminTab(getFirstAvailablePspAdminTab(pspAdminUser?.permissions));
    setPspAdminAuditFilters({
      action: "",
      query: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    setPspAdminAuditDraftFilters({
      action: "",
      query: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    setPspAdminAuditPage(1);
    setPspAdminTwoFactorSetup(null);
    setPspAdminTwoFactorPassword("");
    setPspAdminTwoFactorCode("");
    setPspAdminTwoFactorDisablePassword("");
    setPspAdminTwoFactorDisableCode("");
    setPspAdminRecoveryCodes([]);
    setPspAdminRecoveryCodePassword("");
    setPspAdminRecoveryCodeTotp("");
    setPspAdminCreateUserEmail("");
    setPspAdminCreateUserPassword("");
    setPspAdminCreateUserRole("support");
    setError("");
  }

  async function handleCreatePspAdminUser() {
    if (!pspAdminUser?.permissions.canCreatePspUsers) {
      setError("Только admin может создавать PSP users");
      return;
    }

    if (!pspAdminCreateUserEmail.trim() || !pspAdminCreateUserPassword.trim()) {
      setError("Заполни email и пароль нового PSP user");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/admin/portal/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPspAdminAuthHeaders(),
        },
        body: JSON.stringify({
          email: pspAdminCreateUserEmail.trim(),
          password: pspAdminCreateUserPassword,
          role: pspAdminCreateUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось создать PSP user");
      }

      setPspAdminCreateUserEmail("");
      setPspAdminCreateUserPassword("");
      setPspAdminCreateUserRole("support");
      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось создать PSP user",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handleStartPspAdminTwoFactorSetup() {
    if (!hasPspAdminSession) {
      setError("Сначала войди в PSP Admin");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/admin/portal/2fa/setup`, {
        method: "POST",
        headers: getPspAdminAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось начать настройку 2FA");
      }

      setPspAdminTwoFactorSetup(data);
      setPspAdminTwoFactorPassword("");
      setPspAdminTwoFactorCode("");
      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось начать настройку 2FA",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handleEnablePspAdminTwoFactor() {
    if (!pspAdminTwoFactorSetup) {
      setError("Сначала запусти настройку 2FA");
      return;
    }

    if (!pspAdminTwoFactorPassword.trim() || !pspAdminTwoFactorCode.trim()) {
      setError("Для включения 2FA нужны пароль и 6-значный код");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/admin/portal/2fa/enable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPspAdminAuthHeaders(),
        },
        body: JSON.stringify({
          password: pspAdminTwoFactorPassword,
          code: pspAdminTwoFactorCode.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось включить 2FA");
      }

      setPspAdminUser(data.user || null);
      setPspAdminRecoveryCodes(data.recoveryCodes || []);
      setPspAdminTwoFactorSetup(null);
      setPspAdminTwoFactorPassword("");
      setPspAdminTwoFactorCode("");
      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось включить 2FA");
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handleDisablePspAdminTwoFactor() {
    if (!pspAdminTwoFactorDisablePassword.trim() || !pspAdminTwoFactorDisableCode.trim()) {
      setError("Для отключения 2FA нужны пароль и 6-значный код");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(`${apiBase}/admin/portal/2fa/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPspAdminAuthHeaders(),
        },
        body: JSON.stringify({
          password: pspAdminTwoFactorDisablePassword,
          code: pspAdminTwoFactorDisableCode.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось отключить 2FA");
      }

      setPspAdminUser(data.user || null);
      setPspAdminTwoFactorSetup(null);
      setPspAdminTwoFactorDisablePassword("");
      setPspAdminTwoFactorDisableCode("");
      setPspAdminRecoveryCodes([]);
      setPspAdminRecoveryCodePassword("");
      setPspAdminRecoveryCodeTotp("");
      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить 2FA");
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handleRegeneratePspAdminRecoveryCodes() {
    if (!pspAdminRecoveryCodePassword.trim() || !pspAdminRecoveryCodeTotp.trim()) {
      setError("Для перевыпуска recovery codes нужны пароль и текущий 2FA код");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(
        `${apiBase}/admin/portal/2fa/recovery-codes/regenerate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getPspAdminAuthHeaders(),
          },
          body: JSON.stringify({
            password: pspAdminRecoveryCodePassword,
            code: pspAdminRecoveryCodeTotp.trim(),
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось перевыпустить recovery codes");
      }

      setPspAdminUser(data.user || null);
      setPspAdminRecoveryCodes(data.recoveryCodes || []);
      setPspAdminRecoveryCodePassword("");
      setPspAdminRecoveryCodeTotp("");
      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось перевыпустить recovery codes",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }

  async function handleRevealPspAdminMerchantApiKey(
    merchantId: string,
    password: string,
  ) {
    if (!hasPspAdminSession || !pspAdminUser?.permissions.canRevealMerchantApiKeys) {
      setError("Полный API-ключ может смотреть только admin роль PSP");
      return;
    }

    if (!password.trim()) {
      setError("Перед Reveal нужно повторно ввести пароль PSP admin");
      return;
    }

    setPspAdminLoading(true);
    setError("");

    try {
      const response = await appFetch(
        `${apiBase}/admin/portal/merchants/${merchantId}/reveal-api-key`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getPspAdminAuthHeaders(),
          },
          body: JSON.stringify({
            password,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось раскрыть API-ключ");
      }

      setRevealedMerchantApiKeys((current) => ({
        ...current,
        [merchantId]: data.apiKey,
      }));
      setPspAdminRevealTargetId("");
      setPspAdminRevealPassword("");

      window.setTimeout(() => {
        setRevealedMerchantApiKeys((current) => {
          if (!current[merchantId]) {
            return current;
          }

          const next = { ...current };
          delete next[merchantId];
          return next;
        });
      }, 30000);

      void handleLoadPspAdminOverview();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось раскрыть API-ключ",
      );
    } finally {
      setPspAdminLoading(false);
    }
  }

  function getStatusClass(status: string) {
    // Приводим статус к нижнему регистру
    const normalized = status.toLowerCase();

    // Возвращаем нужный css-класс
    if (normalized === "created") return "status-badge status-created";
    if (normalized === "processing") return "status-badge status-processing";
    if (normalized === "authorized") return "status-badge status-authorized";
    if (normalized === "captured") return "status-badge status-captured";
    if (normalized === "declined") return "status-badge status-declined";
    if (normalized === "timeout") return "status-badge status-timeout";
    if (normalized === "refunded") return "status-badge status-refunded";
    if (normalized === "canceled") return "status-badge status-canceled";
    if (normalized === "error") return "status-badge status-error";
    if (normalized === "chargeback") return "status-badge status-chargeback";

    // Запасной вариант
    return "status-badge";
  }

  function getUpstreamStatusClass(status?: string | null) {
    // Если статуса нет
    if (!status) {
      return "upstream-badge upstream-empty";
    }

    // Приводим к нижнему регистру
    const normalized = status.toLowerCase();

    // Цвета именно для upstream-статусов
    if (normalized === "authorized")
      return "upstream-badge upstream-authorized";
    if (normalized === "declined") return "upstream-badge upstream-declined";
    if (normalized === "chargeback")
      return "upstream-badge upstream-chargeback";
    if (normalized === "error") return "upstream-badge upstream-error";
    if (normalized === "timeout") return "upstream-badge upstream-timeout";

    // Запасной вариант
    return "upstream-badge upstream-default";
  }

  function renderNavigation() {
    const showPspAdminOnly = hasPspAdminSession;
    const canManageMerchantFlows =
      !hasMerchantPortalSession || merchantPortalPermissions?.canManagePayments;
    const showMerchantPortalNav = !showPspAdminOnly;

    if ((showPspAdminOnly && activePage === "psp_admin") || !showMerchantPortalNav) {
      return null;
    }

    // Возвращаем блок навигации по страницам
    return (
      <div className="card">
        {/* Ряд кнопок меню */}
        <div className="button-row nav-row">
          <button
            className={
              activePage === "psp_admin" ? "primary-button" : "secondary-button"
            }
            onClick={() => setActivePage("psp_admin")}
          >
            PSP Admin
          </button>

          {showMerchantPortalNav ? (
            <>
              <button
                className={
                  activePage === "merchant_portal"
                    ? "primary-button"
                    : "secondary-button"
                }
                onClick={() => setActivePage("merchant_portal")}
              >
                Кабинет мерчанта
              </button>

              <button
                className={
                  activePage === "client_checkout"
                    ? "primary-button"
                    : "secondary-button"
                }
                onClick={() => setActivePage("client_checkout")}
                disabled={!canManageMerchantFlows}
              >
                Оплата клиента
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderMerchantPortalSessionStrip() {
    if (
      !hasMerchantPortalSession ||
      hasPspAdminSession ||
      activePage === "merchant_portal"
    ) {
      return null;
    }

    return (
      <div className="card merchant-session-strip">
        <div className="merchant-session-copy">
          <p className="merchant-session-title">Активен кабинет мерчанта</p>
          <p className="section-text">
            {merchantPortalProfile?.name || "Авторизованный мерчант"}
            {merchantPortalProfile?.email
              ? ` • ${merchantPortalProfile.email}`
              : ""}
          </p>
        </div>

        <div className="button-row merchant-session-actions">
          <button
            className="secondary-button"
            onClick={() => setActivePage("merchant_portal")}
          >
            Открыть кабинет
          </button>
          <button
            className="secondary-button"
            onClick={handleMerchantPortalLogout}
          >
            Выйти
          </button>
        </div>
      </div>
    );
  }

  function renderPspAdminSessionStrip() {
    return (
      null
    );
  }

  function renderPspAdminPage() {
    const adminPermissions = pspAdminUser?.permissions;
    const pspAdminAuditActionOptions = [
      "",
      ...Array.from(new Set(pspAdminAuditLogs.map((log) => log.action))).sort(),
    ];
    const normalizedPspAuditQuery = pspAdminAuditFilters.query.trim().toLowerCase();
    const filteredPspAdminAuditLogs = [...pspAdminAuditLogs]
      .filter((log) => {
        if (pspAdminAuditFilters.action && log.action !== pspAdminAuditFilters.action) {
          return false;
        }

        if (!normalizedPspAuditQuery) {
          return true;
        }

        const payloadText = log.payload ? JSON.stringify(log.payload).toLowerCase() : "";

        return [
          log.action,
          log.actorType,
          log.actorId || "",
          log.entityType,
          log.entityId || "",
          payloadText,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedPspAuditQuery);
      })
      .sort((left, right) => {
        const sortOrderFactor = pspAdminAuditFilters.sortOrder === "asc" ? 1 : -1;

        if (pspAdminAuditFilters.sortBy === "action") {
          return left.action.localeCompare(right.action) * sortOrderFactor;
        }

        if (pspAdminAuditFilters.sortBy === "actor") {
          return `${left.actorType}:${left.actorId || ""}`.localeCompare(
            `${right.actorType}:${right.actorId || ""}`,
          ) * sortOrderFactor;
        }

        if (pspAdminAuditFilters.sortBy === "entity") {
          return `${left.entityType}:${left.entityId || ""}`.localeCompare(
            `${right.entityType}:${right.entityId || ""}`,
          ) * sortOrderFactor;
        }

        return (
          (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) *
          sortOrderFactor
        );
      });
    const pspAdminAuditTotalPages = Math.max(
      1,
      Math.ceil(filteredPspAdminAuditLogs.length / 10),
    );
    const normalizedPspAdminAuditPage = Math.min(
      pspAdminAuditPage,
      pspAdminAuditTotalPages,
    );
    const paginatedPspAdminAuditLogs = filteredPspAdminAuditLogs.slice(
      (normalizedPspAdminAuditPage - 1) * 10,
      normalizedPspAdminAuditPage * 10,
    );

    return (
      <>
        {!hasPspAdminSession ? (
          <div className="card merchant-portal-auth-card">
            <div className="merchant-auth-shell">
              {pspAdminCanSelfRegister ? (
                <div className="button-row nav-row merchant-auth-mode-row">
                  <button
                    className={
                      pspAdminAuthMode === "login"
                        ? "primary-button"
                        : "secondary-button"
                    }
                    onClick={() => setPspAdminAuthMode("login")}
                  >
                    Вход
                  </button>
                  <button
                    className={
                      pspAdminAuthMode === "register"
                        ? "primary-button"
                        : "secondary-button"
                    }
                    onClick={() => setPspAdminAuthMode("register")}
                  >
                    Регистрация
                  </button>
                </div>
              ) : null}

              <div className="merchant-profile-shell merchant-auth-form-shell">
                <div className="merchant-portal-auth-grid merchant-form-grid">
                  <div className="field-group">
                    <label className="label">Email</label>
                    <input
                      className="input"
                      value={pspAdminEmail}
                      onChange={(e) => setPspAdminEmail(e.target.value)}
                      placeholder="admin@psp.local"
                    />
                  </div>

                  <div className="field-group">
                    <label className="label">Пароль</label>
                    <input
                      className="input"
                      type="password"
                      value={pspAdminPassword}
                      onChange={(e) => setPspAdminPassword(e.target.value)}
                      placeholder="Минимум 8 символов"
                    />
                  </div>

                  {pspAdminAuthMode === "login" ? (
                    <div className="field-group">
                      <label className="label">Код 2FA</label>
                      <input
                        className="input"
                        value={pspAdminLoginTwoFactorCode}
                        onChange={(e) =>
                          setPspAdminLoginTwoFactorCode(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        placeholder="Если 2FA уже включена"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="button-row merchant-profile-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      void handlePspAdminAuth();
                    }}
                    disabled={pspAdminLoading}
                  >
                    {pspAdminLoading
                      ? "Загрузка..."
                      : pspAdminAuthMode === "login"
                        ? "Войти"
                        : "Создать PSP Admin"}
                  </button>
                </div>
              </div>
            </div>

            {error ? <p className="error-text">{error}</p> : null}
          </div>
        ) : (
          <>
            <div className="merchant-portal-toolbar">
              <div className="button-row nav-row merchant-portal-tabs">
                {adminPermissions?.canViewPayments ? (
                  <button
                    className={pspAdminTab === "payments" ? "primary-button" : "secondary-button"}
                    onClick={() => setPspAdminTab("payments")}
                  >
                    Платежи
                  </button>
                ) : null}
                {adminPermissions?.canViewAuditLogs ? (
                  <button
                    className={pspAdminTab === "audit" ? "primary-button" : "secondary-button"}
                    onClick={() => setPspAdminTab("audit")}
                  >
                    Аудит
                  </button>
                ) : null}
                {adminPermissions?.canViewMerchants ? (
                  <button
                    className={pspAdminTab === "merchants" ? "primary-button" : "secondary-button"}
                    onClick={() => setPspAdminTab("merchants")}
                  >
                    Мерчанты
                  </button>
                ) : null}
                {adminPermissions?.canViewPspUsers ? (
                  <button
                    className={pspAdminTab === "users" ? "primary-button" : "secondary-button"}
                    onClick={() => setPspAdminTab("users")}
                  >
                    Пользователи
                  </button>
                ) : null}
                {adminPermissions?.canManageOwnTwoFactor || adminPermissions?.canViewSecurityStatus ? (
                  <button
                    className={pspAdminTab === "security" ? "primary-button" : "secondary-button"}
                    onClick={() => setPspAdminTab("security")}
                  >
                    Безопасность
                  </button>
                ) : null}
              </div>

              <div className="button-row merchant-session-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void handleLoadPspAdminOverview();
                  }}
                  disabled={pspAdminLoading}
                >
                  {pspAdminLoading ? "Обновление..." : "Обновить PSP Admin"}
                </button>
                <button
                  className="secondary-button"
                  onClick={handlePspAdminLogout}
                >
                  Выйти
                </button>
              </div>
            </div>

            <div className="summary-grid">
              <div className="summary-card">
                <p className="summary-label">PSP Admin</p>
                <p className="summary-value summary-value-small">
                  {pspAdminUser?.email || "—"}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Всего мерчантов</p>
                <p className="summary-value">
                  {pspAdminOverview?.summary.merchantsCount ?? 0}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Всего платежей</p>
                <p className="summary-value">
                  {pspAdminOverview?.summary.paymentsCount ?? 0}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Роль</p>
                <p className="summary-value summary-value-small">
                  {pspAdminUser?.role || "admin"}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">2FA</p>
                <p className="summary-value summary-value-small">
                  {pspAdminUser?.twoFactorEnabled ? "Включена" : "Выключена"}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-label">Recovery codes</p>
                <p className="summary-value summary-value-small">
                  {pspAdminUser?.twoFactorRecoveryCodesRemaining ?? 0}
                </p>
              </div>
            </div>

            {pspAdminTab === "security" &&
            adminPermissions?.canViewSecurityStatus ? (
              <div className="card">
              <h2 className="section-title">Security Infrastructure</h2>
              {!pspAdminSecurityStatus ? (
                <p className="section-text">
                  Статус security-инфраструктуры пока не загружен.
                </p>
              ) : (
                <div className="summary-grid">
                  <div className="summary-card">
                    <p className="summary-label">Rate limit configured</p>
                    <p className="summary-value summary-value-small">
                      {pspAdminSecurityStatus.rateLimit.configuredBackend}
                    </p>
                  </div>
                  <div className="summary-card">
                    <p className="summary-label">Rate limit active</p>
                    <p className="summary-value summary-value-small">
                      {pspAdminSecurityStatus.rateLimit.activeBackend}
                    </p>
                  </div>
                  <div className="summary-card">
                    <p className="summary-label">Redis configured</p>
                    <p className="summary-value summary-value-small">
                      {pspAdminSecurityStatus.rateLimit.redisConfigured
                        ? "Да"
                        : "Нет"}
                    </p>
                  </div>
                  <div className="summary-card">
                    <p className="summary-label">Fallback active</p>
                    <p className="summary-value summary-value-small">
                      {pspAdminSecurityStatus.rateLimit.redisFallbackActive
                        ? "Да"
                        : "Нет"}
                    </p>
                  </div>
                </div>
              )}
              <p className="section-text">
                Простыми словами: `memory` значит лимиты живут внутри процесса
                backend. `redis` значит лимиты вынесены во внешнее хранилище и
                переживают рестарт приложения лучше.
              </p>
              </div>
            ) : null}

            {pspAdminTab === "security" &&
            adminPermissions?.canManageOwnTwoFactor ? (
              <div className="card">
              <h2 className="section-title">2FA PSP Admin</h2>
              <p className="section-text">
                Для входа можно включить TOTP-коды из Google Authenticator,
                1Password или Microsoft Authenticator.
              </p>

              {pspAdminUser?.twoFactorEnabled ? (
                <div className="merchant-settings-security-grid">
                  <div className="card merchant-security-card">
                    <h3 className="sub-title">Управление 2FA</h3>
                    <p className="section-text">
                      2FA уже включена. Для отключения подтверди пароль и текущий
                      6-значный код из приложения.
                    </p>

                    <div className="merchant-profile-shell">
                      <div className="merchant-portal-auth-grid merchant-form-grid">
                        <div className="field-group">
                          <label className="label">Пароль PSP Admin</label>
                          <input
                            className="input"
                            type="password"
                            value={pspAdminTwoFactorDisablePassword}
                            onChange={(e) =>
                              setPspAdminTwoFactorDisablePassword(e.target.value)
                            }
                            placeholder="Подтверди пароль"
                          />
                        </div>

                        <div className="field-group">
                          <label className="label">Код 2FA</label>
                          <input
                            className="input"
                            value={pspAdminTwoFactorDisableCode}
                            onChange={(e) =>
                              setPspAdminTwoFactorDisableCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                              )
                            }
                            placeholder="123456"
                          />
                        </div>
                      </div>

                      <div className="button-row merchant-profile-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void handleDisablePspAdminTwoFactor();
                          }}
                          disabled={pspAdminLoading}
                        >
                          Отключить 2FA
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="card merchant-security-card">
                    <h3 className="sub-title">Recovery codes</h3>
                    <div className="details-card merchant-security-status-card">
                      <p className="section-text">
                        <strong>Осталось recovery codes:</strong>{" "}
                        {pspAdminUser?.twoFactorRecoveryCodesRemaining ?? 0}
                      </p>
                      <p className="section-text">
                        Перевыпуск мгновенно инвалидирует старые recovery codes.
                      </p>
                    </div>

                    <div className="merchant-profile-shell">
                      <div className="merchant-portal-auth-grid merchant-form-grid">
                        <div className="field-group">
                          <label className="label">Пароль PSP Admin</label>
                          <input
                            className="input"
                            type="password"
                            value={pspAdminRecoveryCodePassword}
                            onChange={(e) =>
                              setPspAdminRecoveryCodePassword(e.target.value)
                            }
                            placeholder="Подтверди пароль"
                          />
                        </div>

                        <div className="field-group">
                          <label className="label">Текущий 2FA код</label>
                          <input
                            className="input"
                            value={pspAdminRecoveryCodeTotp}
                            onChange={(e) =>
                              setPspAdminRecoveryCodeTotp(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                              )
                            }
                            placeholder="123456"
                          />
                        </div>
                      </div>

                      <div className="button-row merchant-profile-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            void handleRegeneratePspAdminRecoveryCodes();
                          }}
                          disabled={pspAdminLoading}
                        >
                          Перевыпустить recovery codes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {!pspAdminTwoFactorSetup ? (
                    <div className="button-row">
                      <button
                        className="primary-button"
                        onClick={() => {
                          void handleStartPspAdminTwoFactorSetup();
                        }}
                        disabled={pspAdminLoading}
                      >
                        Начать настройку 2FA
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="details-card">
                        <p className="section-text">
                          <strong>Issuer:</strong> {pspAdminTwoFactorSetup.issuer}
                        </p>
                        <p className="section-text">
                          <strong>Account:</strong>{" "}
                          {pspAdminTwoFactorSetup.accountName}
                        </p>
                        <p className="section-text">
                          <strong>Secret:</strong>{" "}
                          <span className="mono-cell">
                            {pspAdminTwoFactorSetup.secret}
                          </span>
                        </p>
                        <p className="section-text">
                          Скопируй secret в Authenticator или используй
                          otpauth-ссылку ниже.
                        </p>
                        <p className="section-text mono-cell break-anywhere">
                          {pspAdminTwoFactorSetup.otpauthUrl}
                        </p>
                      </div>

                      <div className="merchant-portal-auth-grid merchant-form-grid">
                        <div className="field-group">
                          <label className="label">Пароль PSP Admin</label>
                          <input
                            className="input"
                            type="password"
                            value={pspAdminTwoFactorPassword}
                            onChange={(e) =>
                              setPspAdminTwoFactorPassword(e.target.value)
                            }
                            placeholder="Подтверди пароль"
                          />
                        </div>

                        <div className="field-group">
                          <label className="label">Код из Authenticator</label>
                          <input
                            className="input"
                            value={pspAdminTwoFactorCode}
                            onChange={(e) =>
                              setPspAdminTwoFactorCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                              )
                            }
                            placeholder="123456"
                          />
                        </div>
                      </div>

                      <div className="button-row">
                        <button
                          className="primary-button"
                          onClick={() => {
                            void handleEnablePspAdminTwoFactor();
                          }}
                          disabled={pspAdminLoading}
                        >
                          Включить 2FA
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setPspAdminTwoFactorSetup(null);
                            setPspAdminTwoFactorPassword("");
                            setPspAdminTwoFactorCode("");
                            setError("");
                          }}
                          disabled={pspAdminLoading}
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {pspAdminRecoveryCodes.length ? (
                <div className="details-card">
                  <p className="section-text">
                    <strong>Новые recovery codes:</strong> сохрани их сейчас.
                    Потом они больше не показываются.
                  </p>
                  <div className="summary-grid">
                    {pspAdminRecoveryCodes.map((code) => (
                      <div key={code} className="summary-card">
                        <p className="summary-value summary-value-small mono-cell">
                          {code}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              </div>
            ) : null}

            {pspAdminTab === "users" && adminPermissions?.canViewPspUsers ? (
              <div className="psp-admin-merchants-stack">
              {pspAdminUser?.permissions.canCreatePspUsers ? (
                <div className="card merchant-team-card">
                  <h2 className="section-title">Создать PSP User</h2>
                  <p className="section-text">
                    Добавь нового внутреннего пользователя и сразу назначь ему роль.
                  </p>
                  <div className="merchant-portal-auth-grid merchant-form-grid">
                    <div className="field-group">
                      <label className="label">Новый user email</label>
                      <input
                        className="input"
                        value={pspAdminCreateUserEmail}
                        onChange={(e) =>
                          setPspAdminCreateUserEmail(e.target.value)
                        }
                        placeholder="support@psp.local"
                      />
                    </div>

                    <div className="field-group">
                      <label className="label">Пароль</label>
                      <input
                        className="input"
                        type="password"
                        value={pspAdminCreateUserPassword}
                        onChange={(e) =>
                          setPspAdminCreateUserPassword(e.target.value)
                        }
                        placeholder="Минимум 8 символов"
                      />
                    </div>

                    <div className="field-group">
                      <label className="label">Роль</label>
                      <select
                        className="input"
                        value={pspAdminCreateUserRole}
                        onChange={(e) =>
                          setPspAdminCreateUserRole(
                            e.target.value as
                              | "admin"
                              | "support"
                              | "risk"
                              | "readonly",
                          )
                        }
                      >
                        <option value="support">support</option>
                        <option value="risk">risk</option>
                        <option value="readonly">readonly</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  </div>

                  <div className="button-row merchant-profile-actions">
                    <button
                      className="primary-button"
                      onClick={() => {
                        void handleCreatePspAdminUser();
                      }}
                      disabled={pspAdminLoading}
                    >
                      Создать PSP user
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="card merchant-team-card">
                <h2 className="section-title">PSP Users</h2>
                <p className="section-text">
                  Список всех внутренних пользователей кабинета PSP.
                </p>
                {!pspAdminUsers.length ? (
                  <p className="section-text">Пока внутренние пользователи не найдены.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="payments-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Email</th>
                          <th>Роль</th>
                          <th>Создан</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pspAdminUsers.map((user) => (
                          <tr key={user.id}>
                            <td className="mono-cell">{user.id}</td>
                            <td>{user.email}</td>
                            <td>{user.role}</td>
                            <td>{new Date(user.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              </div>
            ) : null}

            {pspAdminTab === "merchants" &&
            adminPermissions?.canViewMerchants ? (
              <div className="psp-admin-merchants-stack">
                {adminPermissions?.canCreateMerchants ? (
                  <div className="card merchant-team-card">
                    <h2 className="section-title">Создать мерчанта</h2>
                    <p className="section-text">
                      Создание мерчанта здесь сразу выдаёт доступ в merchant cabinet.
                    </p>

                    <div className="merchant-portal-auth-grid merchant-form-grid">
                      <div className="field-group">
                        <label className="label">Название мерчанта</label>
                        <input
                          className="input"
                          value={merchantName}
                          onChange={(e) => setMerchantName(e.target.value)}
                          placeholder="Например: Lucky Spin"
                        />
                      </div>

                      <div className="field-group">
                        <label className="label">Email кабинета</label>
                        <input
                          className="input"
                          value={merchantPortalInviteEmail}
                          onChange={(e) => setMerchantPortalInviteEmail(e.target.value)}
                          placeholder="merchant@example.com"
                        />
                      </div>

                      <div className="field-group">
                        <label className="label">Пароль кабинета</label>
                        <input
                          className="input"
                          type="password"
                          value={merchantPortalInvitePassword}
                          onChange={(e) =>
                            setMerchantPortalInvitePassword(e.target.value)
                          }
                          placeholder="Минимум 8 символов"
                        />
                      </div>
                    </div>

                    <div className="button-row merchant-profile-actions">
                      <button
                        className="primary-button"
                        onClick={() => {
                          void handleCreateMerchant();
                        }}
                        disabled={
                          merchantCreating ||
                          !merchantName.trim() ||
                          !merchantPortalInviteEmail.trim() ||
                          !merchantPortalInvitePassword.trim()
                        }
                      >
                        {merchantCreating ? "Создание..." : "Создать мерчанта"}
                      </button>
                    </div>

                    {createdMerchant ? (
                      <div className="details-card">
                        <p className="section-text">
                          <strong>ID мерчанта:</strong> {createdMerchant.id}
                        </p>

                        <p className="section-text">
                          <strong>Название:</strong> {createdMerchant.name}
                        </p>

                        <p className="section-text">
                          <strong>API-ключ:</strong>{" "}
                          {maskApiKeyValue(createdMerchant.apiKey)}
                        </p>

                        <p className="section-text">
                          <strong>Логин кабинета:</strong> {createdMerchant.email || "Создан"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="card merchant-team-card">
                  <h2 className="section-title">Мерчанты PSP</h2>
                  {!pspAdminOverview?.merchants?.length ? (
                    <p className="section-text">Пока мерчанты не найдены.</p>
                  ) : (
                    <div className="table-wrapper">
                      <table className="payments-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Название</th>
                            <th>Email</th>
                            <th>API key</th>
                            <th>Действия</th>
                            <th>Создан</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pspAdminOverview.merchants.map((merchant) => (
                            <tr key={merchant.id}>
                              <td className="mono-cell">{merchant.id}</td>
                              <td>{merchant.name}</td>
                              <td>{merchant.email || "—"}</td>
                              <td className="mono-cell">
                                {revealedMerchantApiKeys[merchant.id]
                                  ? revealedMerchantApiKeys[merchant.id]
                                  : merchant.apiKeyMasked}
                              </td>
                              <td>
                                {pspAdminUser?.permissions.canRevealMerchantApiKeys ? (
                                  pspAdminRevealTargetId === merchant.id ? (
                                    <div className="psp-reveal-confirm">
                                      <input
                                        className="input"
                                        type="password"
                                        value={pspAdminRevealPassword}
                                        onChange={(e) =>
                                          setPspAdminRevealPassword(e.target.value)
                                        }
                                        placeholder="Подтвердите пароль"
                                      />
                                      <div className="button-row">
                                        <button
                                          className="primary-button"
                                          onClick={() => {
                                            void handleRevealPspAdminMerchantApiKey(
                                              merchant.id,
                                              pspAdminRevealPassword,
                                            );
                                          }}
                                          disabled={pspAdminLoading}
                                        >
                                          Подтвердить
                                        </button>
                                        <button
                                          className="secondary-button"
                                          onClick={() => {
                                            setPspAdminRevealTargetId("");
                                            setPspAdminRevealPassword("");
                                            setError("");
                                          }}
                                          disabled={pspAdminLoading}
                                        >
                                          Отмена
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      className="secondary-button"
                                      onClick={() => {
                                        setPspAdminRevealTargetId(merchant.id);
                                        setPspAdminRevealPassword("");
                                        setError("");
                                      }}
                                      disabled={pspAdminLoading}
                                    >
                                      Reveal
                                    </button>
                                  )
                                ) : (
                                  <span className="section-text">Недоступно</span>
                                )}
                              </td>
                              <td>{new Date(merchant.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {pspAdminTab === "payments" &&
            adminPermissions?.canViewPayments ? (
              <>
              <div className="card">
              <h2 className="section-title">Платежи PSP</h2>

              <div className="merchant-portal-auth-grid merchant-form-grid psp-payments-filter-grid">
                <div className="field-group">
                  <label className="label">Статус</label>
                  <select
                    className="input"
                    value={pspAdminPaymentDraftFilters.status}
                    onChange={(e) =>
                      setPspAdminPaymentDraftFilters((current) => ({
                        ...current,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="">Все статусы</option>
                    {paymentStatusOptions
                      .filter((value) => value)
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="label">Провайдер</label>
                  <select
                    className="input"
                    value={pspAdminPaymentDraftFilters.providerCode}
                    onChange={(e) =>
                      setPspAdminPaymentDraftFilters((current) => ({
                        ...current,
                        providerCode: e.target.value,
                      }))
                    }
                  >
                    <option value="">Все провайдеры</option>
                    {paymentProviderOptions
                      .filter((value) => value)
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="label">Поиск</label>
                  <input
                    className="input"
                    value={pspAdminPaymentDraftFilters.search}
                    onChange={(e) =>
                      setPspAdminPaymentDraftFilters((current) => ({
                        ...current,
                        search: e.target.value,
                      }))
                    }
                    placeholder="ID платежа, ID заказа, merchant, upstream..."
                  />
                </div>

                <div className="field-group">
                  <label className="label">Сортировать по</label>
                  <select
                    className="input"
                    value={pspAdminPaymentDraftFilters.sortBy}
                    onChange={(e) =>
                      setPspAdminPaymentDraftFilters((current) => ({
                        ...current,
                        sortBy: e.target.value as PaymentTableFilters["sortBy"],
                      }))
                    }
                  >
                    <option value="createdAt">Дата создания</option>
                    <option value="updatedAt">Дата обновления</option>
                    <option value="amount">Сумма</option>
                    <option value="status">Статус</option>
                    <option value="providerCode">Провайдер</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="label">Порядок</label>
                  <select
                    className="input"
                    value={pspAdminPaymentDraftFilters.sortOrder}
                    onChange={(e) =>
                      setPspAdminPaymentDraftFilters((current) => ({
                        ...current,
                        sortOrder: e.target.value as "asc" | "desc",
                      }))
                    }
                  >
                    <option value="desc">По убыванию</option>
                    <option value="asc">По возрастанию</option>
                  </select>
                </div>
              </div>

              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => {
                    setPspAdminPaymentFilters(pspAdminPaymentDraftFilters);
                    setPspAdminPaymentsPage(1);
                  }}
                  disabled={pspAdminLoading}
                >
                  Применить
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const resetFilters: PaymentTableFilters = {
                      status: "",
                      providerCode: "",
                      search: "",
                      sortBy: "createdAt",
                      sortOrder: "desc",
                    };
                    setPspAdminPaymentDraftFilters(resetFilters);
                    setPspAdminPaymentFilters(resetFilters);
                    setPspAdminPaymentsPage(1);
                  }}
                  disabled={pspAdminLoading}
                >
                  Сбросить
                </button>
              </div>

              <p className="section-text">
                Найдено платежей: {pspAdminPaymentsTotalCount}
              </p>

              {!pspAdminPayments.length ? (
                <p className="section-text">Платежи пока не найдены.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="payments-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Merchant ID</th>
                        <th>ID заказа</th>
                        <th>Сумма</th>
                        <th>Статус</th>
                        <th>Провайдер</th>
                        <th>Upstream-статус</th>
                        <th>Создан</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pspAdminPayments.map((payment) => (
                        <tr
                          key={payment.id}
                          className="clickable-row"
                          onClick={() => {
                            void handleSelectPspAdminPayment(payment.id);
                          }}
                        >
                          <td className="mono-cell">{payment.id}</td>
                          <td className="mono-cell">{payment.merchantId}</td>
                          <td className="mono-cell">
                            {payment.merchantOrderId || "—"}
                          </td>
                          <td>
                            {payment.amount} {payment.currency}
                          </td>
                          <td>
                            <span className={getStatusClass(payment.status)}>
                              {payment.status}
                            </span>
                          </td>
                          <td>{payment.providerCode || "—"}</td>
                          <td>
                            {payment.upstreamStatus ? (
                              <span className={getStatusClass(payment.upstreamStatus)}>
                                {payment.upstreamStatus}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{new Date(payment.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pagination-row">
                <button
                  className="secondary-button"
                  onClick={() =>
                    setPspAdminPaymentsPage((current) => Math.max(1, current - 1))
                  }
                  disabled={pspAdminLoading || pspAdminPaymentsPage <= 1}
                >
                  Назад
                </button>
                <span className="pagination-text">
                  Страница {pspAdminPaymentsPage} из {pspAdminPaymentsTotalPages}
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setPspAdminPaymentsPage((current) =>
                      Math.min(pspAdminPaymentsTotalPages, current + 1),
                    )
                  }
                  disabled={
                    pspAdminLoading ||
                    pspAdminPaymentsPage >= pspAdminPaymentsTotalPages
                  }
                >
                  Вперёд
                </button>
              </div>

              {error ? <p className="error-text">{error}</p> : null}
              </div>

              <div className="card psp-payment-details-card">
                <h2 className="section-title">Детали платежа PSP</h2>

                {!pspAdminSelectedPayment ? (
                  <p className="section-text">
                    Нажми на строку платежа в таблице, чтобы посмотреть детали и действия.
                  </p>
                ) : (
                  <>
                    <div className="details-summary-grid">
                      <div>
                        <h3 className="sub-title">Основное</h3>
                        <div className="payload-list details-kv-list">
                          <div className="payload-row">
                            <span className="payload-key">ID</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.id}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Merchant ID</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.merchantId}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">ID заказа</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.merchantOrderId || "—"}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Сумма</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.amount}{" "}
                              {pspAdminSelectedPayment.payment.currency}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Статус</span>
                            <span className="payload-value">
                              <span
                                className={getStatusClass(
                                  pspAdminSelectedPayment.payment.status,
                                )}
                              >
                                {pspAdminSelectedPayment.payment.status}
                              </span>
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Провайдер</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.providerCode || "—"}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Upstream ID</span>
                            <span className="payload-value">
                              {pspAdminSelectedPayment.payment.upstreamId || "—"}
                            </span>
                          </div>
                          <div className="payload-row">
                            <span className="payload-key">Upstream-статус</span>
                            <span className="payload-value">
                              <span
                                className={getUpstreamStatusClass(
                                  pspAdminSelectedPayment.payment.upstreamStatus,
                                )}
                              >
                                {pspAdminSelectedPayment.payment.upstreamStatus || "—"}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="details-side-column">
                        <h3 className="sub-title">Карта</h3>

                        {!pspAdminSelectedPayment.card ? (
                          <p className="section-text">Карточные данные не найдены.</p>
                        ) : (
                          <div className="payload-list details-kv-list">
                            <div className="payload-row">
                              <span className="payload-key">Бренд</span>
                              <span className="payload-value">
                                {pspAdminSelectedPayment.card.brand}
                              </span>
                            </div>
                            <div className="payload-row">
                              <span className="payload-key">BIN</span>
                              <span className="payload-value">
                                {pspAdminSelectedPayment.card.bin}
                              </span>
                            </div>
                            <div className="payload-row">
                              <span className="payload-key">Последние 4 цифры</span>
                              <span className="payload-value">
                                {pspAdminSelectedPayment.card.last4}
                              </span>
                            </div>
                            <div className="payload-row">
                              <span className="payload-key">Срок действия</span>
                              <span className="payload-value">
                                {pspAdminSelectedPayment.card.expMonth}/
                                {pspAdminSelectedPayment.card.expYear}
                              </span>
                            </div>
                          </div>
                        )}
                        {adminPermissions?.canManagePayments &&
                        pspAdminSelectedPayment.payment.status === "created" ? (
                          <div className="details-actions details-actions-inline">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void handlePspAdminPaymentAction(
                                  "process",
                                  "Не удалось запустить платёж",
                                );
                              }}
                              disabled={pspAdminActionLoading}
                            >
                              {pspAdminActionLoading ? "Обработка..." : "Запустить"}
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => {
                                void handlePspAdminPaymentAction(
                                  "cancel",
                                  "Не удалось отменить платёж",
                                );
                              }}
                              disabled={pspAdminActionLoading}
                            >
                              Отменить
                            </button>
                          </div>
                        ) : null}

                        {adminPermissions?.canManagePayments &&
                        (pspAdminSelectedPayment.payment.status === "processing" ||
                          pspAdminSelectedPayment.payment.status === "authorized") ? (
                          <div className="details-actions details-actions-inline">
                            {pspAdminSelectedPayment.payment.status === "authorized" ? (
                              <button
                                className="primary-button"
                                onClick={() => {
                                  void handlePspAdminPaymentAction(
                                    "capture",
                                    "Не удалось подтвердить списание",
                                  );
                                }}
                                disabled={pspAdminActionLoading}
                              >
                                {pspAdminActionLoading ? "Подтверждение..." : "Подтвердить"}
                              </button>
                            ) : null}
                            <button
                              className="secondary-button"
                              onClick={() => {
                                void handlePspAdminPaymentAction(
                                  "cancel",
                                  "Не удалось отменить платёж",
                                );
                              }}
                              disabled={pspAdminActionLoading}
                            >
                              Отменить
                            </button>
                          </div>
                        ) : null}

                        {adminPermissions?.canManagePayments &&
                        (pspAdminSelectedPayment.payment.status === "timeout" ||
                          pspAdminSelectedPayment.payment.status === "error") ? (
                          <div className="details-actions details-actions-inline">
                            <button
                              className="primary-button"
                              onClick={() => {
                                void handlePspAdminPaymentAction(
                                  "retry",
                                  "Не удалось повторить платёж",
                                );
                              }}
                              disabled={pspAdminActionLoading}
                            >
                              {pspAdminActionLoading ? "Повтор..." : "Повторить"}
                            </button>
                          </div>
                        ) : null}

                        {adminPermissions?.canManagePayments &&
                        pspAdminSelectedPayment.payment.status === "captured" ? (
                          <div className="details-actions details-actions-inline">
                            <button
                              className="secondary-button"
                              onClick={() => {
                                void handlePspAdminPaymentAction(
                                  "refund",
                                  "Не удалось выполнить возврат",
                                );
                              }}
                              disabled={pspAdminActionLoading}
                            >
                              {pspAdminActionLoading ? "Возврат..." : "Возврат"}
                            </button>
                          <button
                            className="secondary-button demo-warning-button"
                            onClick={() => {
                              void handlePspAdminPaymentAction(
                                "simulate-chargeback",
                                "Не удалось симулировать внешний чарджбэк",
                              );
                            }}
                            disabled={pspAdminActionLoading}
                          >
                            {pspAdminActionLoading
                              ? "Симуляция..."
                              : "Демо: чарджбэк от банка-эквайера"}
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              void handlePspAdminPaymentAction(
                                "chargeback",
                                "Не удалось выполнить чарджбэк",
                              );
                            }}
                            disabled={pspAdminActionLoading}
                          >
                            {pspAdminActionLoading ? "Чарджбэк..." : "Чарджбэк"}
                          </button>
                        </div>
                      ) : null}
                      </div>
                    </div>

                    <div className="details-card details-events">
                      <h3 className="sub-title">События</h3>

                      {!pspAdminSelectedPayment.events.length ? (
                        <p className="section-text">Событий пока нет.</p>
                      ) : (
                        pspAdminSelectedPayment.events.map((event) => (
                          <div key={event.id} className="event-box">
                            <p className="section-text">
                              <strong>Тип:</strong> {event.type}
                            </p>

                            <span className={getStatusClass(event.status)}>
                              {event.status}
                            </span>

                            <p className="section-text">
                              <strong>Создано:</strong>{" "}
                              {new Date(event.createdAt).toLocaleString()}
                            </p>

                            {renderPayload(event.payload)}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
              </>
            ) : null}

            {pspAdminTab === "audit" && adminPermissions?.canViewAuditLogs ? (
              <div className="card">
              <h2 className="section-title">Аудит PSP</h2>
              <p className="section-text">
                Здесь видна история внутренних действий по кабинету PSP.
              </p>

              <div className="merchant-portal-auth-grid events-filter-grid">
                <div className="field-group">
                  <label className="label">Фильтр по действию</label>
                  <select
                    className="input audit-filter-input"
                    value={pspAdminAuditDraftFilters.action}
                    onChange={(e) =>
                      setPspAdminAuditDraftFilters((current) => ({
                        ...current,
                        action: e.target.value,
                      }))
                    }
                  >
                    <option value="">Все действия</option>
                    {pspAdminAuditActionOptions
                      .filter((item) => item)
                      .map((action) => (
                        <option key={action} value={action}>
                          {formatAuditAction(action)}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="label">Поиск</label>
                  <input
                    className="input audit-filter-input"
                    value={pspAdminAuditDraftFilters.query}
                    onChange={(e) =>
                      setPspAdminAuditDraftFilters((current) => ({
                        ...current,
                        query: e.target.value,
                      }))
                    }
                    placeholder="action, actor, entity..."
                  />
                </div>

                <div className="field-group">
                  <label className="label">Сортировать по</label>
                  <select
                    className="input audit-filter-input"
                    value={pspAdminAuditDraftFilters.sortBy}
                    onChange={(e) =>
                      setPspAdminAuditDraftFilters((current) => ({
                        ...current,
                        sortBy: e.target.value,
                      }))
                    }
                  >
                    <option value="createdAt">Дата события</option>
                    <option value="action">Действие</option>
                    <option value="actor">Кто выполнил</option>
                    <option value="entity">Сущность</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="label">Порядок</label>
                  <select
                    className="input audit-filter-input"
                    value={pspAdminAuditDraftFilters.sortOrder}
                    onChange={(e) =>
                      setPspAdminAuditDraftFilters((current) => ({
                        ...current,
                        sortOrder: e.target.value as "asc" | "desc",
                      }))
                    }
                  >
                    <option value="desc">По убыванию</option>
                    <option value="asc">По возрастанию</option>
                  </select>
                </div>
              </div>

              <div className="button-row">
                <button
                  className="primary-button"
                  onClick={() => {
                    setPspAdminAuditFilters(pspAdminAuditDraftFilters);
                    setPspAdminAuditPage(1);
                  }}
                  disabled={pspAdminLoading}
                >
                  Применить фильтры
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    const resetFilters = {
                      action: "",
                      query: "",
                      sortBy: "createdAt",
                      sortOrder: "desc" as "asc" | "desc",
                    };
                    setPspAdminAuditDraftFilters(resetFilters);
                    setPspAdminAuditFilters(resetFilters);
                    setPspAdminAuditPage(1);
                  }}
                  disabled={pspAdminLoading}
                >
                  Сбросить
                </button>
              </div>

              <p className="section-text">
                Найдено событий: {filteredPspAdminAuditLogs.length}.
              </p>

              {!paginatedPspAdminAuditLogs.length ? (
                <p className="section-text">Аудит-событий пока нет.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="payments-table merchant-events-table">
                    <thead>
                      <tr>
                        <th>Время</th>
                        <th>Действие</th>
                        <th>Кто выполнил</th>
                        <th>Сущность</th>
                        <th>Данные</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPspAdminAuditLogs.map((log) => {
                        const payloadRows = getAuditPayloadRows(log.payload, {
                          hiddenKeys: ["actorEmail", "merchantId"],
                        });

                        return (
                        <tr key={log.id}>
                          <td className="merchant-events-time">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="merchant-events-action">
                            {formatAuditAction(log.action)}
                          </td>
                          <td className="merchant-events-meta">
                            <div className="merchant-events-meta-label">
                              {formatAuditActor(log.actorType)}
                            </div>
                            <div className="mono-cell merchant-events-mono">
                              {log.actorId || "—"}
                            </div>
                          </td>
                          <td className="merchant-events-meta">
                            <div className="merchant-events-meta-label">
                              {formatAuditEntity(log.entityType)}
                            </div>
                            <div className="mono-cell merchant-events-mono">
                              {log.entityId || "—"}
                            </div>
                          </td>
                          <td className="merchant-events-payload-cell">
                            {payloadRows.length ? (
                              <div className="payload-list merchant-events-payload-list">
                                {payloadRows.map((row) => (
                                  <div
                                    key={`${log.id}-${row.key}`}
                                    className="payload-row merchant-events-payload-row"
                                  >
                                    <div className="payload-key merchant-events-payload-key">
                                      {row.key}
                                    </div>
                                    <div className="payload-value merchant-events-payload-value">
                                      {row.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="merchant-events-empty">Нет данных</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {pspAdminAuditTotalPages > 1 ? (
                <div className="pagination-row">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setPspAdminAuditPage((current) => Math.max(1, current - 1))
                    }
                    disabled={pspAdminLoading || normalizedPspAdminAuditPage <= 1}
                  >
                    Назад
                  </button>
                  <span className="pagination-text">
                    Страница {normalizedPspAdminAuditPage} из{" "}
                    {pspAdminAuditTotalPages}
                  </span>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      setPspAdminAuditPage((current) =>
                        Math.min(pspAdminAuditTotalPages, current + 1),
                      )
                    }
                    disabled={
                      pspAdminLoading ||
                      normalizedPspAdminAuditPage >= pspAdminAuditTotalPages
                    }
                  >
                    Вперёд
                  </button>
                </div>
              ) : null}
              </div>
            ) : null}
          </>
        )}
      </>
    );
  }

  async function handleCreateMerchant() {
    // Если название пустое — сразу показываем ошибку
    if (!merchantName.trim()) {
      setError("Введи название мерчанта");
      return;
    }

    if (hasPspAdminSession) {
      if (!merchantPortalInviteEmail.trim() || !merchantPortalInvitePassword.trim()) {
        setError("Заполни email и пароль для кабинета мерчанта");
        return;
      }
    }

    // Чистим старую ошибку
    setError("");

    // Чистим старый результат
    setCreatedMerchant(null);

    // Включаем loader кнопки
    setMerchantCreating(true);

    try {
      const response = hasPspAdminSession
        ? await appFetch(`${apiBase}/admin/portal/merchants`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getPspAdminAuthHeaders(),
            },
            body: JSON.stringify({
              name: merchantName.trim(),
              email: merchantPortalInviteEmail.trim().toLowerCase(),
              password: merchantPortalInvitePassword,
            }),
          })
        : await fetch(`${apiBase}/merchant/create`, {
            method: "POST", // POST-запрос
            headers: {
              "Content-Type": "application/json", // Отправляем JSON
            },
            body: JSON.stringify({
              name: merchantName.trim(), // Передаём имя нового мерчанта
            }),
          });

      // Читаем JSON-ответ
      const data = await response.json();

      // Если backend вернул ошибку — кидаем её
      if (!response.ok) {
        throw new Error(data.message || "Не удалось создать мерчанта");
      }

      // Поддерживаем 2 варианта ответа:
      // 1) data.merchant
      // 2) data напрямую
      const merchant = data.merchant ?? data;

      // Сохраняем созданного мерчанта
      setCreatedMerchant({
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        apiKey: merchant.apiKey,
      });

      // Очищаем поле после успеха
      setMerchantName("");
      setMerchantPortalInviteEmail("");
      setMerchantPortalInvitePassword("");

      if (hasPspAdminSession) {
        void handleLoadPspAdminOverview();
      }
    } catch (err) {
      // Показываем ошибку
      setError(
        err instanceof Error ? err.message : "Не удалось создать мерчанта",
      );
    } finally {
      // Выключаем loader
      setMerchantCreating(false);
    }
  }

  async function handleCreateCheckoutSession() {
    // Нужен либо кабинет, либо API-ключ
    if (!hasMerchantPortalSession && !apiKey.trim()) {
      setError("Сначала войди в кабинет мерчанта или укажи API-ключ мерчанта");
      return;
    }

    // Простая проверка формы
    if (!checkoutAmount.trim() || !checkoutCurrency.trim()) {
      setError("Заполни сумму и валюту для создания checkout session");
      return;
    }

    setError("");
    setCheckoutCreating(true);
    setCheckoutUrl("");
    setCheckoutSessionId("");

    try {
      const normalizedAmount = Number(checkoutAmount.replace(",", ".").trim());

      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        throw new Error("Сумма должна быть положительным числом");
      }

      const frontendBaseUrl = window.location.origin;

      // Пока готовим правильный контракт под hosted checkout
      const checkoutPayload = {
        amount: normalizedAmount,
        currency: checkoutCurrency.trim().toUpperCase(),
        merchantOrderId: checkoutOrderId.trim() || undefined,
        returnUrl: `${frontendBaseUrl}?page=payments`,
        cancelUrl: `${frontendBaseUrl}?page=payments`,
      };

      const response = hasMerchantPortalSession
        ? await appFetch(`${apiBase}/merchant/portal/checkout/session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getMerchantPortalAuthHeaders(),
            },
            body: JSON.stringify(checkoutPayload),
          })
        : await fetch(`${apiBase}/checkout/session`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: apiKey,
              ...checkoutPayload,
            }),
          });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось создать checkout session");
      }

      const session = data.session ?? data;
      const nextCheckoutUrl = session.checkoutUrl || "";

      setCheckoutSessionId(session.sessionId || session.id || "");
      setCheckoutUrl(nextCheckoutUrl);

      if (nextCheckoutUrl) {
        const openedTab = window.open(nextCheckoutUrl, "_blank");

        if (openedTab) {
          openedTab.focus();
        } else {
          window.location.href = nextCheckoutUrl;
        }
      }

      // Чистим только форму
      setCheckoutAmount("");
      setCheckoutCurrency("EUR");
      setCheckoutOrderId(generateFrontendMerchantOrderId());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать checkout session",
      );
    } finally {
      setCheckoutCreating(false);
    }
  }

  async function handleStubPay() {
    // Если paymentId пустой — сразу показываем ошибку
    if (!stubPaymentId.trim()) {
      setError("Не найден paymentId для stub-оплаты");
      return;
    }

    // Чистим старую ошибку
    setError("");

    // Включаем loader кнопки
    setStubPaying(true);

    try {
      // Стучимся в уже готовый backend-роут
      const response = await fetch(`${apiBase}/checkout/stub-pay`, {
        method: "POST", // POST-запрос
        headers: {
          "Content-Type": "application/json", // JSON body
        },
        body: JSON.stringify({
          paymentId: stubPaymentId, // Передаём id платежа
        }),
      });

      // Читаем JSON
      const data = await response.json();

      // Если backend вернул ошибку — кидаем её
      if (!response.ok) {
        throw new Error(data.message || "Не удалось провести stub-оплату");
      }

      // Ставим флаг успеха
      setStubPaid(true);
    } catch (err) {
      // Показываем ошибку
      setError(
        err instanceof Error ? err.message : "Не удалось провести stub-оплату",
      );
    } finally {
      // Выключаем loader кнопки
      setStubPaying(false);
    }
  }

  async function handleBackToPayments() {
    // Запоминаем текущий paymentId, чтобы открыть его после обновления
    const currentPaymentId = stubPaymentId;

    // Чистим старую ошибку
    setError("");

    // Чистим stub-состояние
    setStubPaid(false);
    setStubSessionId("");
    setStubPaymentId("");

    // Переключаемся обратно в кабинет мерчанта
    setActivePage("merchant_portal");

    // Чистим query string из адресной строки
    window.history.replaceState({}, "", window.location.pathname);

    // Если есть кабинет или apiKey — обновляем список
    if (hasMerchantPortalSession || apiKey.trim()) {
      await handleLoadData(false);
    }

    // Если есть paymentId — сразу открываем детали именно этого платежа
    if (currentPaymentId.trim() && (hasMerchantPortalSession || apiKey.trim())) {
      await handleSelectPayment(currentPaymentId);
    }
  }

  function renderSettingsPage() {
    if (!hasMerchantPortalSession) {
      return (
        <div className="card">
          <h2 className="section-title">Настройки</h2>
          <p className="section-text">
            Войди в кабинет мерчанта, чтобы управлять профилем и интеграционным
            API-ключом.
          </p>
        </div>
      );
    }

    return (
      <>
        {merchantPortalProfile?.currentUser?.permissions.canManageMerchantProfile ? (
        <div className="card merchant-portal-auth-card merchant-profile-card">
          <h2 className="section-title">Профиль мерчанта</h2>
          <div className="merchant-profile-shell">
            <p className="section-text merchant-profile-copy">
              Обнови основные данные кабинета. Эти значения видны в профиле
              мерчанта и используются для служебных уведомлений.
            </p>
            <div className="merchant-profile-meta">
              <span>
                <strong>Текущий пользователь:</strong>{" "}
                {merchantPortalProfile?.currentUser?.email ||
                  merchantPortalProfile?.email ||
                  "—"}
              </span>
              <span>
                <strong>Роль:</strong>{" "}
                {merchantPortalProfile?.currentUser?.role || "owner"}
              </span>
            </div>

            <div className="merchant-portal-auth-grid merchant-profile-grid">
              <div className="field-group">
                <label className="label">Название мерчанта</label>
                <input
                  className="input"
                  value={merchantSettingsName}
                  onChange={(e) => setMerchantSettingsName(e.target.value)}
                  placeholder="Lucky Spin"
                />
              </div>

              <div className="field-group">
                <label className="label">Email</label>
                <input
                  className="input"
                  value={merchantSettingsEmail}
                  onChange={(e) => setMerchantSettingsEmail(e.target.value)}
                  placeholder="merchant@example.com"
                />
              </div>
            </div>

            <div className="button-row merchant-profile-actions">
              <button
                className="primary-button"
                onClick={() => {
                  void handleMerchantProfileSave();
                }}
                disabled={merchantPortalLoading}
              >
                {merchantPortalLoading ? "Сохранение..." : "Сохранить профиль"}
              </button>
            </div>
          </div>
        </div>
        ) : null}

        <div className="merchant-settings-security-grid">
        <div className="card merchant-security-card">
          <h2 className="section-title">2FA мерчанта</h2>
          <p className="section-text">
            2FA защищает вход в кабинет и подтверждает чувствительные действия
            вроде показа и ротации API-ключа.
          </p>

          {merchantPortalProfile?.currentUser?.twoFactorEnabled ? (
            <>
              <div className="details-card merchant-security-status-card">
                <p className="section-text">
                  2FA уже включена. Для отключения подтверди пароль и текущий
                  код из Authenticator.
                </p>
              </div>
              <div className="merchant-portal-auth-grid merchant-form-grid">
                <div className="field-group">
                  <label className="label">Пароль мерчанта</label>
                  <input
                    className="input"
                    type="password"
                    value={merchantPortalTwoFactorDisablePassword}
                    onChange={(e) =>
                      setMerchantPortalTwoFactorDisablePassword(e.target.value)
                    }
                    placeholder="Подтверди пароль"
                  />
                </div>

                <div className="field-group">
                  <label className="label">Код 2FA</label>
                  <input
                    className="input"
                    value={merchantPortalTwoFactorDisableCode}
                    onChange={(e) =>
                      setMerchantPortalTwoFactorDisableCode(e.target.value)
                    }
                    placeholder="6-значный код"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="button-row merchant-profile-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    void handleDisableMerchantPortalTwoFactor();
                  }}
                  disabled={merchantPortalLoading}
                >
                  Отключить 2FA
                </button>
              </div>
            </>
          ) : !merchantPortalTwoFactorSetup ? (
            <>
              <div className="details-card merchant-security-status-card">
                <p className="section-text">
                  2FA пока выключена. Включи её перед показом или ротацией
                  интеграционного API-ключа.
                </p>
              </div>
              <div className="button-row merchant-profile-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void handleStartMerchantPortalTwoFactorSetup();
                  }}
                  disabled={merchantPortalLoading}
                >
                  Начать настройку 2FA
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="details-card merchant-security-status-card">
                <p className="section-text">
                  <strong>Секрет:</strong>{" "}
                  <span className="mono-cell">{merchantPortalTwoFactorSetup.secret}</span>
                </p>
                <p className="section-text">
                  Скопируй секрет в Authenticator или используй ссылку ниже.
                </p>
                <p className="section-text mono-cell break-anywhere">
                  {merchantPortalTwoFactorSetup.otpauthUrl}
                </p>
              </div>

              <div className="merchant-portal-auth-grid merchant-form-grid">
                <div className="field-group">
                  <label className="label">Пароль мерчанта</label>
                  <input
                    className="input"
                    type="password"
                    value={merchantPortalTwoFactorPassword}
                    onChange={(e) => setMerchantPortalTwoFactorPassword(e.target.value)}
                    placeholder="Подтверди пароль"
                  />
                </div>

                <div className="field-group">
                  <label className="label">Код 2FA</label>
                  <input
                    className="input"
                    value={merchantPortalTwoFactorCode}
                    onChange={(e) => setMerchantPortalTwoFactorCode(e.target.value)}
                    placeholder="6-значный код"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="button-row merchant-profile-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    void handleEnableMerchantPortalTwoFactor();
                  }}
                  disabled={merchantPortalLoading}
                >
                  Включить 2FA
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setMerchantPortalTwoFactorSetup(null);
                    setMerchantPortalTwoFactorPassword("");
                    setMerchantPortalTwoFactorCode("");
                  }}
                  disabled={merchantPortalLoading}
                >
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>

        {merchantPortalProfile?.currentUser?.permissions.canRotateApiKey ? (
        <div className="card merchant-security-card">
          <h2 className="section-title">Интеграционный API-ключ</h2>
          <p className="section-text">
            Этот ключ нужен для server-to-server интеграций мерчанта и не должен
            использоваться в браузере как основной способ авторизации.
          </p>

          <div className="details-card merchant-security-status-card">
            <p className="section-text">
              <strong>Текущий ключ:</strong>{" "}
              {revealedMerchantPortalApiKey || merchantPortalProfile?.apiKeyMasked || "—"}
            </p>
            {!merchantPortalProfile?.currentUser?.twoFactorEnabled ? (
              <p className="section-text">
                Для показа и ротации ключа сначала включи 2FA в соседнем блоке.
              </p>
            ) : null}
          </div>

          <div className="merchant-portal-auth-grid merchant-form-grid">
            <div className="field-group">
              <label className="label">Пароль мерчанта</label>
              <input
                className="input"
                type="password"
                value={merchantPortalApiKeyPassword}
                onChange={(e) => setMerchantPortalApiKeyPassword(e.target.value)}
                placeholder="Подтверди пароль"
              />
            </div>

            <div className="field-group">
              <label className="label">Код 2FA</label>
              <input
                className="input"
                value={merchantPortalApiKeyCode}
                onChange={(e) => setMerchantPortalApiKeyCode(e.target.value)}
                placeholder="6-значный код"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => {
                void handleRevealMerchantApiKey();
              }}
              disabled={
                merchantPortalLoading ||
                !merchantPortalProfile?.currentUser?.twoFactorEnabled
              }
            >
              {merchantPortalLoading ? "Показ..." : "Показать ключ"}
            </button>
            <button
              className="primary-button"
              onClick={() => {
                void handleRotateMerchantApiKey();
              }}
              disabled={
                merchantPortalLoading ||
                !merchantPortalProfile?.currentUser?.twoFactorEnabled
              }
            >
              {merchantPortalLoading ? "Ротация..." : "Ротировать API-ключ"}
            </button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </div>
        ) : null}
        </div>

        {merchantPortalProfile?.currentUser?.permissions.canManageMerchantUsers ? (
          <div className="merchant-team-grid">
          <div className="card merchant-team-card">
            <h2 className="section-title">Команда мерчанта</h2>
            <p className="section-text">
              Добавь нового участника команды и сразу назначь ему роль в
              кабинете мерчанта.
            </p>

            <div className="merchant-portal-auth-grid merchant-form-grid">
              <div className="field-group">
                <label className="label">Email пользователя</label>
                <input
                  className="input"
                  value={merchantUserEmail}
                  onChange={(e) => setMerchantUserEmail(e.target.value)}
                  placeholder="manager@example.com"
                />
              </div>

              <div className="field-group">
                <label className="label">Пароль</label>
                <input
                  className="input"
                  type="password"
                  value={merchantUserPassword}
                  onChange={(e) => setMerchantUserPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                />
              </div>

              <div className="field-group">
                <label className="label">Роль</label>
                <select
                  className="input"
                  value={merchantUserRole}
                  onChange={(e) =>
                    setMerchantUserRole(
                      e.target.value as "owner" | "manager" | "readonly",
                    )
                  }
                >
                  <option value="owner">owner</option>
                  <option value="manager">manager</option>
                  <option value="readonly">readonly</option>
                </select>
              </div>
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => {
                  void handleCreateMerchantUser();
                }}
                disabled={
                  merchantPortalLoading ||
                  !merchantUserEmail.trim() ||
                  !merchantUserPassword.trim()
                }
              >
                {merchantPortalLoading ? "Создание..." : "Добавить пользователя"}
              </button>
            </div>
          </div>

          <div className="card merchant-team-card">
            <h2 className="section-title">Участники команды</h2>
            <p className="section-text">
              Здесь видны владелец и все добавленные пользователи кабинета.
            </p>

            {!merchantPortalUsers.length ? (
              <p className="section-text">Пользователи команды пока не добавлены.</p>
            ) : (
              <div className="table-wrapper">
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Роль</th>
                      <th>Тип</th>
                      <th>Активен</th>
                      <th>Создан</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantPortalUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.email}</td>
                        <td>
                          {user.isLegacyOwner ? (
                            user.role
                          ) : (
                            <select
                              className="input"
                              value={merchantUserRoleDrafts[user.id] || user.role}
                              onChange={(e) =>
                                setMerchantUserRoleDrafts((current) => ({
                                  ...current,
                                  [user.id]: e.target.value,
                                }))
                              }
                              disabled={merchantPortalLoading || !user.isActive}
                            >
                              <option value="owner">owner</option>
                              <option value="manager">manager</option>
                              <option value="readonly">readonly</option>
                            </select>
                          )}
                        </td>
                        <td>{user.isLegacyOwner ? "legacy owner" : "team user"}</td>
                        <td>{user.isActive ? "Да" : "Нет"}</td>
                        <td>{new Date(user.createdAt).toLocaleString()}</td>
                        {!user.isLegacyOwner && user.isActive ? (
                          <td>
                            <div className="button-row">
                              <button
                                className="secondary-button"
                                onClick={() => {
                                  void handleUpdateMerchantUserRole(user.id);
                                }}
                                disabled={
                                  merchantPortalLoading ||
                                  (merchantUserRoleDrafts[user.id] || user.role) === user.role
                                }
                              >
                                Сохранить роль
                              </button>
                              <button
                                className="secondary-button"
                                onClick={() => {
                                  void handleDeactivateMerchantUser(user.id);
                                }}
                                disabled={merchantPortalLoading}
                              >
                                Деактивировать
                              </button>
                            </div>
                          </td>
                        ) : (
                          <td>—</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error ? <p className="error-text">{error}</p> : null}
          </div>
          </div>
        ) : null}

      </>
    );
  }

  function renderMerchantEventsPage() {
    if (!merchantPortalProfile?.currentUser?.permissions.canViewMerchantAudit) {
      return (
        <div className="card">
          <h2 className="section-title">События</h2>
          <p className="section-text">
            Текущая роль мерчанта не может просматривать audit log кабинета.
          </p>
        </div>
      );
    }

    return (
      <div className="card">
        <h2 className="section-title">События мерчанта</h2>
        <p className="section-text">
          Здесь владелец видит историю действий по кабинету и команде своего
          мерчанта.
        </p>

        <div className="events-filter-grid">
          <div className="field-group">
            <label className="label">Фильтр по действию</label>
            <select
              className="input"
              value={merchantAuditFilters.action}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  action: e.target.value,
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
            >
              <option value="">Все действия</option>
              {merchantAuditActionOptions
                .filter((value) => value)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>

          <div className="field-group">
            <label className="label">Поиск</label>
            <input
              className="input"
              value={merchantAuditFilters.query}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  query: e.target.value,
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
              placeholder="email, role, action..."
            />
          </div>

          <div className="field-group">
            <label className="label">Дата от</label>
            <input
              className="input"
              type="date"
              value={merchantAuditFilters.dateFrom}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  dateFrom: e.target.value,
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
            />
          </div>

          <div className="field-group">
            <label className="label">Дата до</label>
            <input
              className="input"
              type="date"
              value={merchantAuditFilters.dateTo}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  dateTo: e.target.value,
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
            />
          </div>

          <div className="field-group">
            <label className="label">Сортировать по</label>
            <select
              className="input"
              value={merchantAuditFilters.sortBy}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  sortBy: e.target.value as MerchantAuditFilters["sortBy"],
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
            >
              <option value="createdAt">Дата события</option>
              <option value="action">Действие</option>
              <option value="actorType">Кто выполнил</option>
              <option value="entityType">Сущность</option>
            </select>
          </div>

          <div className="field-group">
            <label className="label">Порядок</label>
            <select
              className="input"
              value={merchantAuditFilters.sortOrder}
              onChange={(e) => {
                setMerchantAuditFilters((current) => ({
                  ...current,
                  sortOrder: e.target.value as "asc" | "desc",
                }));
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: 1,
                }));
              }}
            >
              <option value="desc">По убыванию</option>
              <option value="asc">По возрастанию</option>
            </select>
          </div>
        </div>

        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => {
              void handleLoadMerchantPortalOverview();
            }}
            disabled={merchantPortalLoading}
          >
            {merchantPortalLoading ? "Обновление..." : "Применить фильтры"}
          </button>
          <button
            className="secondary-button"
            onClick={exportMerchantAuditLogsToCsv}
            disabled={!merchantPortalAuditLogs.length}
          >
            Экспорт CSV
          </button>
        </div>

        <p className="section-text">
          Найдено событий: {merchantAuditPagination.totalCount}.
        </p>

        {!merchantPortalAuditLogs.length ? (
          <p className="section-text">
            Audit-событий для этого мерчанта пока нет.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="payments-table merchant-events-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Действие</th>
                  <th>Кто выполнил</th>
                  <th>Сущность</th>
                  <th>Данные</th>
                </tr>
              </thead>
              <tbody>
                {merchantPortalAuditLogs.map((log) => {
                  const payloadRows = getAuditPayloadRows(log.payload, {
                    hiddenKeys: ["actorEmail", "merchantId"],
                  });

                  return (
                    <tr key={log.id}>
                      <td className="merchant-events-time">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="merchant-events-action">
                        {formatAuditAction(log.action)}
                      </td>
                      <td className="merchant-events-meta">
                        <div className="merchant-events-meta-label">
                          {formatAuditActor(log.actorType)}
                        </div>
                        <div className="mono-cell merchant-events-mono">
                          {log.actorId || "—"}
                        </div>
                      </td>
                      <td className="merchant-events-meta">
                        <div className="merchant-events-meta-label">
                          {formatAuditEntity(log.entityType)}
                        </div>
                        <div className="mono-cell merchant-events-mono">
                          {log.entityId || "—"}
                        </div>
                      </td>
                      <td className="merchant-events-payload-cell">
                        {payloadRows.length ? (
                          <div className="payload-list merchant-events-payload-list">
                            {payloadRows.map((row) => (
                              <div
                                key={`${log.id}-${row.key}`}
                                className="payload-row merchant-events-payload-row"
                              >
                                <div className="payload-key merchant-events-payload-key">
                                  {row.key}
                                </div>
                                <div className="payload-value merchant-events-payload-value">
                                  {row.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="merchant-events-empty">Нет данных</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {merchantAuditPagination.totalPages > 1 ? (
          <div className="pagination-row">
            <button
              className="secondary-button"
              onClick={() =>
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: Math.max(1, current.page - 1),
                }))
              }
              disabled={merchantPortalLoading || merchantAuditPagination.page <= 1}
            >
              Назад
            </button>
            <span className="pagination-text">
              Страница {merchantAuditPagination.page} из{" "}
              {merchantAuditPagination.totalPages}
            </span>
            <button
              className="secondary-button"
              onClick={() =>
                setMerchantAuditPagination((current) => ({
                  ...current,
                  page: Math.min(current.totalPages, current.page + 1),
                }))
              }
              disabled={
                merchantPortalLoading ||
                merchantAuditPagination.page >= merchantAuditPagination.totalPages
              }
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderClientCheckoutPage() {
    const canManageMerchantFlows =
      !hasMerchantPortalSession || merchantPortalPermissions?.canManagePayments;

    if (hasMerchantPortalSession && !canManageMerchantFlows) {
      return (
        <div className="card">
          <h2 className="section-title">Клиентская оплата</h2>
          <p className="section-text">
            Текущая роль мерчанта может просматривать данные, но не может создавать
            checkout session.
          </p>
        </div>
      );
    }

    // Это отдельная страница клиента для перехода к hosted checkout
    return (
      <>
        <div className="card">
          <h2 className="section-title">Клиентская оплата</h2>
          <p className="section-text">
            Здесь клиент не вводит карту в нашу форму. Мы создаём checkout
            session и отправляем клиента на защищённую страницу PSP.
          </p>
        </div>

        <div className="card create-payment-card">
          <h2 className="section-title">Создать checkout session</h2>

          <div className="payment-form-grid">
            <div className="field-group">
              <label className="label">Сумма</label>
              <input
                className="input"
                value={checkoutAmount}
                onChange={(e) => setCheckoutAmount(e.target.value)}
                placeholder="100.00"
                inputMode="decimal"
              />
            </div>

            <div className="field-group">
              <label className="label">Валюта</label>
              <select
                className="input"
                value={checkoutCurrency}
                onChange={(e) => setCheckoutCurrency(e.target.value)}
              >
                {PAYMENT_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="label">ID заказа мерчанта</label>
              <input
                className="input"
                value={checkoutOrderId}
                onChange={(e) => setCheckoutOrderId(e.target.value)}
                placeholder="Будет подставлен автоматически"
              />
            </div>
          </div>

          <div className="button-row payment-form-actions">
              <button
                className="primary-button"
                onClick={handleCreateCheckoutSession}
                disabled={
                  checkoutCreating ||
                (!hasMerchantPortalSession && !apiKey.trim()) ||
                !checkoutAmount.trim() ||
                !checkoutCurrency.trim()
              }
            >
              {checkoutCreating ? "Создание..." : "Создать session"}
            </button>
          </div>

          {checkoutSessionId ? (
            <p className="section-text">
              <strong>Session ID:</strong> {checkoutSessionId}
            </p>
          ) : null}

          {checkoutUrl ? (
            <p className="section-text">
              <strong>Checkout URL:</strong> {checkoutUrl}
            </p>
          ) : null}
        </div>
      </>
    );
  }

  function renderCheckoutStubPage() {
    return (
      <>
        <div className="card">
          <h2 className="section-title">Checkout stub</h2>

          <p className="section-text">
            Это временная клиентская страница оплаты. Здесь мы имитируем
            успешную оплату через stub.
          </p>
        </div>

        <div className="card">
          <h2 className="section-title">Данные session</h2>

          <p className="section-text">
            <strong>Session ID:</strong> {stubSessionId || "—"}
          </p>

          <p className="section-text">
            <strong>Payment ID:</strong> {stubPaymentId || "—"}
          </p>

          <div className="button-row">
            <button
              className="primary-button"
              onClick={handleStubPay} // Запускаем stub-оплату
              disabled={stubPaying || !stubPaymentId.trim()} // Блокируем кнопку во время запроса
            >
              {stubPaying ? "Обработка..." : "Оплатить тестово"}
            </button>
            {stubPaid ? (
              <>
                <p className="section-text">
                  Тестовая оплата проведена. Платёж должен перейти в статус
                  <strong> authorized</strong>.
                </p>

                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      void handleBackToPayments();
                    }}
                  >
                    Вернуться в панель
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
        </div>
      </>
    );
  }

  function renderPaymentsPage() {
    return (
      <>
        {renderPaymentsToolbar()}

        <div className="payments-bottom-stack">
          {renderPaymentsTableSection()}
          {renderPaymentDetailsSection()}
        </div>
      </>
    );
  }

  function renderPaymentsTableSection() {
    // Рисуем карточку со списком платежей
    return (
      <div className="card">
        {/* Заголовок блока */}
        <h2 className="section-title">Платежи мерчанта</h2>

        {/* Если списка нет — показываем пустое состояние */}
        {!payments.length ? (
          <p className="section-text">Пока список платежей пуст.</p>
        ) : (
          // Если платежи есть — показываем таблицу
          <div className="table-wrapper">
            <table className="payments-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>ID заказа</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Провайдер</th>
                  <th>Upstream-статус</th>
                  <th>Создан</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id} // Уникальный ключ строки
                    className="clickable-row" // Делаем строку кликабельной
                    onClick={() => handleSelectPayment(payment.id)} // По клику грузим детали платежа
                  >
                    <td className="mono-cell">{payment.id}</td>
                    <td className="mono-cell">
                      {payment.merchantOrderId || "—"}
                    </td>

                    <td>
                      {payment.amount} {payment.currency}
                    </td>

                    <td>
                      <span className={getStatusClass(payment.status)}>
                        {payment.status}
                      </span>
                    </td>

                    <td>{payment.providerCode}</td>

                    <td>
                      <span
                        className={getUpstreamStatusClass(
                          payment.upstreamStatus,
                        )}
                      >
                        {payment.upstreamStatus || "—"}
                      </span>
                    </td>

                    <td>{new Date(payment.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Блок пагинации */}
        <div className="pagination-row">
          <button
            className="secondary-button"
            onClick={() => {
              const newPage = Math.max(page - 1, 1); // Считаем предыдущую страницу
              setPage(newPage); // Сохраняем новую страницу
            }}
            disabled={page === 1 || loading} // Блокируем кнопку на первой странице или во время загрузки
          >
            Назад
          </button>

          <span className="pagination-text">
            Страница {page} из {totalPages}
          </span>

          <button
            className="secondary-button"
            onClick={() => {
              const newPage = Math.min(page + 1, totalPages); // Считаем следующую страницу
              setPage(newPage); // Сохраняем новую страницу
            }}
            disabled={page === totalPages || loading} // Блокируем кнопку на последней странице или во время загрузки
          >
            Вперёд
          </button>
        </div>
      </div>
    );
  }

  function renderPaymentDetailsSection() {
    const canManageMerchantFlows =
      !hasMerchantPortalSession || merchantPortalPermissions?.canManagePayments;

    // Рисуем карточку с деталями выбранного платежа
    return (
      <div className="card">
        {/* Заголовок блока */}
        <h2 className="section-title">Детали платежа</h2>

        {/* Если платёж ещё не выбран — показываем подсказку */}
        {!selectedPayment ? (
          <p className="section-text">
            Нажми на строку платежа в таблице, чтобы посмотреть детали.
          </p>
        ) : (
          // Если платёж выбран — показываем все детали
          <div className="details-grid">
            <div className="details-card">
              <div className="details-summary-grid">
                <div>
                  <h3 className="sub-title">Основное</h3>
                  <div className="payload-list details-kv-list">
                    <div className="payload-row">
                      <span className="payload-key">ID</span>
                      <span className="payload-value">
                        {selectedPayment.payment.id}
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">ID заказа</span>
                      <span className="payload-value">
                        {selectedPayment.payment.merchantOrderId || "—"}
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">Сумма</span>
                      <span className="payload-value">
                        {selectedPayment.payment.amount}{" "}
                        {selectedPayment.payment.currency}
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">Статус</span>
                      <span className="payload-value">
                        <span
                          className={getStatusClass(selectedPayment.payment.status)}
                        >
                          {selectedPayment.payment.status}
                        </span>
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">Провайдер</span>
                      <span className="payload-value">
                        {selectedPayment.payment.providerCode}
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">Upstream ID</span>
                      <span className="payload-value">
                        {selectedPayment.payment.upstreamId || "—"}
                      </span>
                    </div>
                    <div className="payload-row">
                      <span className="payload-key">Upstream-статус</span>
                      <span className="payload-value">
                        <span
                          className={getUpstreamStatusClass(
                            selectedPayment.payment.upstreamStatus,
                          )}
                        >
                          {selectedPayment.payment.upstreamStatus || "—"}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="details-side-column">
                  <h3 className="sub-title">Карта</h3>

                  {!selectedPayment.card ? (
                    <p className="section-text">Карточные данные не найдены.</p>
                  ) : (
                    <div className="payload-list details-kv-list">
                      <div className="payload-row">
                        <span className="payload-key">Бренд</span>
                        <span className="payload-value">
                          {selectedPayment.card.brand}
                        </span>
                      </div>
                      <div className="payload-row">
                        <span className="payload-key">BIN</span>
                        <span className="payload-value">
                          {selectedPayment.card.bin}
                        </span>
                      </div>
                      <div className="payload-row">
                        <span className="payload-key">Последние 4 цифры</span>
                        <span className="payload-value">
                          {selectedPayment.card.last4}
                        </span>
                      </div>
                      <div className="payload-row">
                        <span className="payload-key">Срок действия</span>
                        <span className="payload-value">
                          {selectedPayment.card.expMonth}/
                          {selectedPayment.card.expYear}
                        </span>
                      </div>
                    </div>
                  )}
                  {selectedPayment.payment.status === "created" ? (
                    <div className="details-actions details-actions-inline">
                      <button
                        className="primary-button"
                        onClick={handleProcessPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        {actionLoading ? "Обработка..." : "Запустить"}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={handleCancelPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Отменить
                      </button>
                    </div>
                  ) : null}

                  {selectedPayment.payment.status === "timeout" ||
                  selectedPayment.payment.status === "error" ? (
                    <div className="details-actions details-actions-inline">
                      <button
                        className="primary-button"
                        onClick={handleRetryPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        {actionLoading ? "Повтор..." : "Повторить"}
                      </button>
                    </div>
                  ) : null}

                  {selectedPayment.payment.status === "processing" ? (
                    <div className="details-actions details-actions-inline">
                      <button
                        className="secondary-button"
                        onClick={handleCancelPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Отменить
                      </button>
                    </div>
                  ) : null}

                  {selectedPayment.payment.status === "authorized" ? (
                    <div className="details-actions details-actions-inline">
                      <button
                        className="primary-button"
                        onClick={handleCapturePayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        {actionLoading ? "Подтверждение..." : "Подтвердить"}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={handleCancelPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Отменить
                      </button>
                    </div>
                  ) : null}

                  {selectedPayment.payment.status === "captured" ? (
                    <div className="details-actions details-actions-inline">
                      <button
                        className="secondary-button"
                        onClick={handleRefundPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Возврат
                      </button>
                      <button
                        className="secondary-button demo-warning-button"
                        onClick={handleSimulateChargebackPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Демо: чарджбэк от банка-эквайера
                      </button>
                      <button
                        className="secondary-button"
                        onClick={handleChargebackPayment}
                        disabled={actionLoading || !canManageMerchantFlows}
                      >
                        Чарджбэк
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="details-card details-events">
              <h3 className="sub-title">События</h3>

              {!selectedPayment.events.length ? (
                <p className="section-text">Событий пока нет.</p>
              ) : (
                selectedPayment.events.map((event) => (
                  <div key={event.id} className="event-box">
                    <p className="section-text">
                      <strong>Тип:</strong> {event.type}
                    </p>

                    <span className={getStatusClass(event.status)}>
                      {event.status}
                    </span>

                    <p className="section-text">
                      <strong>Создано:</strong>{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </p>

                    {renderPayload(event.payload)}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPaymentsToolbar() {
    return (
      <div className="card  payments-toolbar">
        <h2 className="section-title">Фильтры и сортировка</h2>
        {/* Поле с адресом backend */}
        <div className="field-group">
          <label className="label">API Base URL</label>
          <input
            className="input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://localhost:3000"
          />
        </div>

        {/* Поле с API-ключом мерчанта */}
        {hasMerchantPortalSession ? null : (
          <div className="field-group">
            <label className="label">API-ключ мерчанта</label>
            <input
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="mch_..."
            />
          </div>
        )}

        <div className="merchant-portal-auth-grid payments-filter-grid">
          <div className="field-group">
            <label className="label">Статус</label>
            <select
              className="input"
              value={paymentTableFilters.status}
              onChange={(e) =>
                setPaymentTableFilters((current) => ({
                  ...current,
                  status: e.target.value,
                }))
              }
            >
              <option value="">Все статусы</option>
              {paymentStatusOptions
                .filter((value) => value)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>

          <div className="field-group">
            <label className="label">Провайдер</label>
            <select
              className="input"
              value={paymentTableFilters.providerCode}
              onChange={(e) =>
                setPaymentTableFilters((current) => ({
                  ...current,
                  providerCode: e.target.value,
                }))
              }
            >
              <option value="">Все провайдеры</option>
              {paymentProviderOptions
                .filter((value) => value)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>

          <div className="field-group">
            <label className="label">Поиск</label>
            <input
              className="input"
              value={paymentTableFilters.search}
              onChange={(e) =>
                setPaymentTableFilters((current) => ({
                  ...current,
                  search: e.target.value,
                }))
              }
              placeholder="ID платежа, ID заказа, upstream, статус..."
            />
          </div>

          <div className="field-group">
            <label className="label">Сортировать по</label>
            <select
              className="input"
              value={paymentTableFilters.sortBy}
              onChange={(e) =>
                setPaymentTableFilters((current) => ({
                  ...current,
                  sortBy: e.target.value as PaymentTableFilters["sortBy"],
                }))
              }
            >
              <option value="createdAt">Дата создания</option>
              <option value="updatedAt">Дата обновления</option>
              <option value="amount">Сумма</option>
              <option value="status">Статус</option>
              <option value="providerCode">Провайдер</option>
            </select>
          </div>

          <div className="field-group">
            <label className="label">Порядок</label>
            <select
              className="input"
              value={paymentTableFilters.sortOrder}
              onChange={(e) =>
                setPaymentTableFilters((current) => ({
                  ...current,
                  sortOrder: e.target.value as "asc" | "desc",
                }))
              }
            >
              <option value="desc">По убыванию</option>
              <option value="asc">По возрастанию</option>
            </select>
          </div>
        </div>

        <div className="button-row">
          <button
            className="primary-button"
            onClick={() => {
              if (page !== 1) {
                setPage(1);
                return;
              }
              void handleLoadData(true);
            }}
            disabled={loading} // Блокируем кнопку во время загрузки
          >
            {loading ? "Загрузка..." : "Применить"}
          </button>

          <button
            className="secondary-button"
            onClick={() => {
              setPaymentTableFilters({
                status: "",
                providerCode: "",
                search: "",
                sortBy: "createdAt",
                sortOrder: "desc",
              });
              if (page !== 1) {
                setPage(1);
                return;
              }
              void handleLoadData(true);
            }}
            disabled={loading}
          >
            Сбросить
          </button>
        </div>

        {/* Если есть ошибка — показываем её */}
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  function renderMerchantPortalPage() {
    const overview = merchantPortalOverview;
    const merchant = merchantPortalProfile || overview?.merchant || null;

    return (
      <>
        {!merchantPortalToken.trim() ? (
          <div className="card merchant-portal-auth-card">
            <h2 className="section-title">Кабинет мерчанта</h2>
            <div className="merchant-auth-shell">
              <div className="merchant-profile-shell merchant-auth-form-shell">
                <div className="merchant-portal-auth-grid merchant-form-grid">
                  {merchantPortalAuthMode === "register" ? (
                    <div className="field-group">
                      <label className="label">Название мерчанта</label>
                      <input
                        className="input"
                        value={merchantPortalName}
                        onChange={(e) => setMerchantPortalName(e.target.value)}
                        placeholder="Например: Lucky Spin"
                      />
                    </div>
                  ) : null}

                  <div className="field-group">
                    <label className="label">Email</label>
                    <input
                      className="input"
                      value={merchantPortalEmail}
                      onChange={(e) => setMerchantPortalEmail(e.target.value)}
                      placeholder="merchant@example.com"
                    />
                  </div>

                  <div className="field-group">
                    <label className="label">Пароль</label>
                    <input
                      className="input"
                      type="password"
                      value={merchantPortalPassword}
                      onChange={(e) => setMerchantPortalPassword(e.target.value)}
                      placeholder="Минимум 8 символов"
                    />
                  </div>

                  <div className="field-group">
                    <label className="label">Код 2FA</label>
                    <input
                      className="input"
                      value={merchantPortalLoginTwoFactorCode}
                      onChange={(e) =>
                        setMerchantPortalLoginTwoFactorCode(e.target.value)
                      }
                      placeholder="Если 2FA уже включена"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="button-row merchant-profile-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      void handleMerchantPortalAuth();
                    }}
                    disabled={merchantPortalLoading}
                  >
                    {merchantPortalLoading
                      ? "Загрузка..."
                      : merchantPortalAuthMode === "login"
                        ? "Войти"
                        : "Создать кабинет"}
                  </button>
                </div>
              </div>
            </div>

            {error ? <p className="error-text">{error}</p> : null}
          </div>
        ) : (
          <>
            <div className="card">
              <div className="merchant-portal-toolbar">
                <div>
                  <h2 className="section-title">Кабинет мерчанта</h2>
                  <p className="section-text">
                    {merchant?.name || "Мерчант"} •{" "}
                    {merchantPortalProfile?.currentUser?.email ||
                      merchant?.email ||
                      "—"}
                    {" • "}
                    {merchantPortalProfile?.currentUser?.role || "owner"}
                  </p>
                </div>

                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={() => {
                      void handleLoadMerchantPortalOverview();
                    }}
                    disabled={merchantPortalLoading}
                  >
                    {merchantPortalLoading ? "Обновление..." : "Обновить кабинет"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      void handleMerchantPortalLogout();
                    }}
                    disabled={merchantPortalLoading}
                  >
                    Выйти
                  </button>
                </div>
              </div>

              <div className="button-row nav-row merchant-portal-tabs">
                <button
                  className={
                    merchantPortalTab === "profile"
                      ? "primary-button"
                      : "secondary-button"
                  }
                  onClick={() => setMerchantPortalTab("profile")}
                >
                  Личный кабинет
                </button>
                <button
                  className={
                    merchantPortalTab === "payments"
                      ? "primary-button"
                      : "secondary-button"
                  }
                  onClick={() => setMerchantPortalTab("payments")}
                >
                  Платежи
                </button>
                <button
                  className={
                    merchantPortalTab === "events"
                      ? "primary-button"
                      : "secondary-button"
                  }
                  onClick={() => setMerchantPortalTab("events")}
                >
                  События
                </button>
              </div>

              <div className="summary-grid">
                <div className="summary-card">
                  <p className="summary-label">Мерчант</p>
                  <p className="summary-value summary-value-small">
                    {merchant?.name || "—"}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Email</p>
                  <p className="summary-value summary-value-small">
                    {merchant?.email || "—"}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Роль</p>
                  <p className="summary-value summary-value-small">
                    {merchantPortalProfile?.currentUser?.role || "owner"}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">API-ключ</p>
                  <p className="summary-value summary-value-small">
                    {merchant?.apiKeyMasked || "—"}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Всего платежей</p>
                  <p className="summary-value">
                    {overview?.summary.totalCount ?? payments.length}
                  </p>
                </div>
              </div>
            </div>

            {merchantPortalTab === "profile" ? renderSettingsPage() : null}
            {merchantPortalTab === "payments" ? renderPaymentsPage() : null}
            {merchantPortalTab === "events" ? renderMerchantEventsPage() : null}
          </>
        )}
      </>
    );
  }

  function renderActivePage() {
    // Показываем нужную страницу в зависимости от activePage
    if (activePage === "psp_admin") {
      return renderPspAdminPage();
    }

    if (activePage === "merchant_portal") {
      if (hasPspAdminSession) {
        return renderPspAdminPage();
      }
      return renderMerchantPortalPage();
    }

    if (activePage === "client_checkout") {
      if (hasPspAdminSession) {
        return renderPspAdminPage();
      }
      return renderClientCheckoutPage(); // Экран клиентской оплаты
    }

    if (activePage === "checkout_stub") {
      return renderCheckoutStubPage(); // Временная страница checkout
    }

    if (activePage === "public_checkout") {
      const params = new URLSearchParams(window.location.search);

      return (
        <PublicCheckoutPage
          sessionIdFromUrl={params.get("sessionId") || ""}
          apiBaseFromUrl={params.get("apiBase") || ""}
        />
      );
    }

    // Запасной вариант, если страница не подошла
    return null;
  }
  return (
    <div className="page">
      <div className="container">
        {activePage === "public_checkout" ? null : (
          <>
            <h1 className="page-title">Панель управления PSP</h1>
            <p className="page-subtitle">
              Операционный кабинет платформы: платежи, мерчанты, аудит и безопасность.
            </p>
            {renderNavigation()}
            {renderPspAdminSessionStrip()}
            {renderMerchantPortalSessionStrip()}
          </>
        )}
        {renderActivePage()}
      </div>
    </div>
  );
}

export default App;
