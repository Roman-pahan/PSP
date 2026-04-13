import { useEffect, useMemo, useState } from "react";

type PublicCheckoutPageProps = {
  apiBaseFromUrl?: string;
  sessionIdFromUrl?: string;
};

type CheckoutSessionResponse = {
  sessionId: string;
  payment: {
    id: string;
    merchantId: string;
    merchantName: string;
    amount: string;
    currency: string;
    status: string;
    providerCode: string | null;
    upstreamId: string | null;
    upstreamStatus: string | null;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    merchantOrderId: string;
    returnUrl: string;
    cancelUrl: string;
    expiresAt: string;
  };
};

const CARD_MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

function formatCardNumberInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 16);
  return digitsOnly.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function getCardBrand(cardNumber: string) {
  const normalized = cardNumber.replace(/\D/g, "");

  if (normalized.startsWith("4")) {
    return "visa";
  }

  if (normalized.startsWith("5")) {
    return "mastercard";
  }

  return "unknown";
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();

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

  return "status-badge";
}

export default function PublicCheckoutPage({
  apiBaseFromUrl,
  sessionIdFromUrl,
}: PublicCheckoutPageProps) {
  const [session, setSession] = useState<CheckoutSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [providerCode, setProviderCode] = useState<"" | "mock_bank" | "fake_bank">("");

  const apiBase = apiBaseFromUrl?.trim() || "http://localhost:3000";
  const sessionId = sessionIdFromUrl?.trim() || "";

  const cardYears = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(new Date().getFullYear() + index)),
    [],
  );

  async function loadSession(showLoader = true) {
    if (!sessionId) {
      setError("Не найден sessionId в URL публичного checkout");
      setLoading(false);
      return;
    }

    if (showLoader) {
      setLoading(true);
    }

    try {
      const response = await fetch(
        `${apiBase}/checkout/session/${encodeURIComponent(sessionId)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось загрузить checkout session");
      }

      setSession(data);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось загрузить checkout session",
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  async function handleSubmitPayment() {
    if (!sessionId) {
      setError("Не найден sessionId для оплаты");
      return;
    }

    if (!cardNumber.trim() || !expMonth.trim() || !expYear.trim() || !cvv.trim()) {
      setError("Заполни все поля карты");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${apiBase}/checkout/session/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          cardNumber: cardNumber.replace(/\s/g, ""),
          expMonth: Number(expMonth),
          expYear: Number(expYear),
          cvv: cvv.trim(),
          providerCode: providerCode || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Не удалось отправить оплату");
      }

      setSession(data.session);
      setCardNumber("");
      setExpMonth("");
      setExpYear("");
      setCvv("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось отправить оплату",
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void loadSession(true);
  }, [sessionId, apiBase]);

  useEffect(() => {
    const currentStatus = session?.payment.status?.toLowerCase() || "";
    const shouldPoll = ["created", "processing", "authorized"].includes(currentStatus);

    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadSession(false);
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [session?.payment.status, sessionId, apiBase]);

  const isExpired =
    !!session?.session.expiresAt &&
    new Date(session.session.expiresAt).getTime() < Date.now();

  const isPayable =
    session?.payment.status === "created" && !isExpired;
  const cardBrand = getCardBrand(cardNumber);

  return (
    <div className="public-checkout-shell">
      <div className="public-checkout-container">
        <div className="public-checkout-hero">
          <p className="public-checkout-kicker">Sandbox Public Checkout</p>
          <h1 className="page-title public-checkout-title">
            Оплата для клиента
          </h1>
          <p className="page-subtitle public-checkout-subtitle">
            Публичный контур оплаты через sandbox-эквайринг. Карта вводится
            только для тестовой симуляции `mock_bank` и `fake_bank`.
          </p>
        </div>

        {loading ? (
          <div className="card">
            <p className="section-text">Загрузка checkout session...</p>
          </div>
        ) : null}

        {session ? (
          <>
            <div className="public-checkout-grid">
              <div className="public-checkout-sidebar">
                <div className="card">
                  <h2 className="section-title">Заказ</h2>

                  <div className="details-card">
                    <p className="section-text">
                      <strong>Merchant:</strong> {session.payment.merchantName}
                    </p>
                    <p className="section-text">
                      <strong>ID заказа мерчанта:</strong>{" "}
                      {session.session.merchantOrderId || "—"}
                    </p>
                    <p className="section-text">
                      <strong>Payment ID:</strong> {session.payment.id}
                    </p>
                    <p className="section-text">
                      <strong>Сумма:</strong> {session.payment.amount}{" "}
                      {session.payment.currency}
                    </p>
                    <p className="section-text">
                      <strong>Статус:</strong>{" "}
                      <span className={getStatusClass(session.payment.status)}>
                        {session.payment.status}
                      </span>
                    </p>
                    <p className="section-text">
                      <strong>Провайдер:</strong>{" "}
                      {session.payment.providerCode || "будет выбран при оплате"}
                    </p>
                    {session.session.expiresAt ? (
                      <p className="section-text">
                        <strong>Действует до:</strong>{" "}
                        {new Date(session.session.expiresAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="card">
                  <h2 className="section-title">Результат</h2>

                  <div className="details-card">
                    <p className="section-text">
                      <strong>Статус апстрима:</strong>{" "}
                      {session.payment.upstreamStatus || "—"}
                    </p>
                    <p className="section-text">
                      <strong>Upstream ID:</strong>{" "}
                      {session.payment.upstreamId || "—"}
                    </p>
                    <p className="section-text">
                      <strong>Обновлено:</strong>{" "}
                      {new Date(session.payment.updatedAt).toLocaleString()}
                    </p>

                    {session.payment.status === "authorized" &&
                    session.session.returnUrl ? (
                      <div className="button-row">
                        <button
                          className="primary-button"
                          onClick={() => {
                            window.location.href = session.session.returnUrl;
                          }}
                        >
                          Вернуться к мерчанту
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="card">
                  <h2 className="section-title">Автовыбор</h2>

                  <div className="field-group public-provider-field public-provider-field-sidebar">
                    <div className="public-provider-header">
                      <span className="public-provider-badge">BANK</span>
                      <label className="label">Sandbox provider</label>
                    </div>
                    <select
                      className="input"
                      value={providerCode}
                      onChange={(e) =>
                        setProviderCode(
                          e.target.value as "" | "mock_bank" | "fake_bank",
                        )
                      }
                      disabled={!isPayable || submitting}
                    >
                      <option value="">Автовыбор</option>
                      <option value="mock_bank">mock_bank</option>
                      <option value="fake_bank">fake_bank</option>
                    </select>
                    <p className="public-provider-help">
                      Автовыбор использует встроенные правила PSP. Можно вручную
                      переключить sandbox-банк для нужного сценария.
                    </p>
                  </div>
                </div>
              </div>

              <div className="card public-card-panel">
                <h2 className="section-title">Карта клиента</h2>

                <div className="public-card-payment-box">
                  <div className="public-checkout-note public-checkout-note-compact">
                    Для проверки можно использовать `4111 1111 1111 1111`.
                    `mock_bank` авторизует суммы меньше 5000, `fake_bank`
                    сразу отклоняет.
                  </div>

                  <div className="public-card-surface">
                    <div
                      className={`public-card-brand public-card-brand-${cardBrand}`}
                    >
                      {cardBrand === "visa" ? (
                        <span className="public-card-brand-text">VISA</span>
                      ) : null}

                      {cardBrand === "mastercard" ? (
                        <div className="public-card-mastercard-mark">
                          <span className="public-card-mastercard-circle public-card-mastercard-left" />
                          <span className="public-card-mastercard-circle public-card-mastercard-right" />
                        </div>
                      ) : null}

                      {cardBrand === "unknown" ? (
                        <span className="public-card-brand-placeholder">
                          CARD
                        </span>
                      ) : null}
                    </div>

                    <div className="public-card-number-block">
                      <label className="label public-card-label">Номер карты</label>
                      <input
                        className="input public-card-input"
                        value={cardNumber}
                        onChange={(e) =>
                          setCardNumber(formatCardNumberInput(e.target.value))
                        }
                        placeholder="4111 1111 1111 1111"
                        inputMode="numeric"
                        maxLength={19}
                        disabled={!isPayable || submitting}
                      />
                    </div>

                    <div className="public-card-bottom-row">
                      <div className="public-card-expiry-block">
                        <label className="label public-card-label">Срок карты</label>

                        <div className="expiry-row">
                          <select
                            className="input public-card-input"
                            value={expMonth}
                            onChange={(e) => setExpMonth(e.target.value)}
                            disabled={!isPayable || submitting}
                          >
                            <option value="">MM</option>
                            {CARD_MONTHS.map((month) => (
                              <option key={month} value={month}>
                                {month}
                              </option>
                            ))}
                          </select>

                          <select
                            className="input public-card-input"
                            value={expYear}
                            onChange={(e) => setExpYear(e.target.value)}
                            disabled={!isPayable || submitting}
                          >
                            <option value="">ГГГГ</option>
                            {cardYears.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="public-card-cvv-block">
                        <label className="label public-card-label">CVV</label>
                        <input
                          className="input public-card-input"
                          value={cvv}
                          onChange={(e) =>
                            setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          placeholder="123"
                          inputMode="numeric"
                          disabled={!isPayable || submitting}
                        />
                      </div>
                    </div>
                  </div>

                </div>

                <div className="button-row payment-form-actions">
                  <button
                    className="primary-button"
                    onClick={handleSubmitPayment}
                    disabled={!isPayable || submitting}
                  >
                    {submitting ? "Отправка..." : "Оплатить"}
                  </button>

                  {session.session.cancelUrl ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        window.location.href = session.session.cancelUrl;
                      }}
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>

                {!isPayable && session.payment.status !== "created" ? (
                  <p className="section-text">
                    Платёж отправлен в обработку. Текущий статус:{" "}
                    <strong>{session.payment.status}</strong>.
                  </p>
                ) : null}

                {isExpired ? (
                  <p className="error-text">
                    Checkout session истекла. Создай новую session в панели
                    администратора.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {error ? (
          <div className="card">
            <p className="error-text">{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
