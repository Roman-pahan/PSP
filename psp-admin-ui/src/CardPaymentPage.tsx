type CardPaymentPageProps = {
  apiKey: string;
  hasMerchantPortalSession: boolean;
  merchantContextLabel: string;
  paymentAmount: string;
  paymentCurrency: string;
  cardNumber: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  paymentCreating: boolean;
  error: string;
  paymentCurrencies: string[];
  cardMonths: string[];
  cardYears: string[];
  onPaymentAmountChange: (value: string) => void;
  onPaymentCurrencyChange: (value: string) => void;
  onCardNumberChange: (value: string) => void;
  onCardExpMonthChange: (value: string) => void;
  onCardExpYearChange: (value: string) => void;
  onCardCvvChange: (value: string) => void;
  onFillRandom: () => void;
  onCreatePayment: () => void;
};

export default function CardPaymentPage({
  apiKey,
  hasMerchantPortalSession,
  merchantContextLabel,
  paymentAmount,
  paymentCurrency,
  cardNumber,
  cardExpMonth,
  cardExpYear,
  cardCvv,
  paymentCreating,
  error,
  paymentCurrencies,
  cardMonths,
  cardYears,
  onPaymentAmountChange,
  onPaymentCurrencyChange,
  onCardNumberChange,
  onCardExpMonthChange,
  onCardExpYearChange,
  onCardCvvChange,
  onFillRandom,
  onCreatePayment,
}: CardPaymentPageProps) {
  return (
    <div className="card-payment-shell">
      <div className="card-payment-hero">
        <p className="card-payment-kicker">Card Payment Module</p>
        <h1 className="page-title card-payment-title">Создание карточного платежа</h1>
        <p className="page-subtitle card-payment-subtitle">
          Отдельный внутренний модуль для ручного создания card payment. Форма
          вынесена из общего экрана платежей и теперь живёт как отдельная
          вкладка.
        </p>
      </div>

      <div className="card card-payment-card">
        <h2 className="section-title">Новый карточный платёж</h2>

        <div className="card-payment-hint">
          {hasMerchantPortalSession ? (
            <>
              Платёж создаётся от имени авторизованного мерчанта. Текущий
              контекст: <strong>{merchantContextLabel || "мерчант кабинета"}</strong>
            </>
          ) : (
            <>
              API-ключ мерчанта берётся из общего состояния приложения. Текущий
              ключ: <strong>{apiKey || "не задан"}</strong>
            </>
          )}
        </div>

        <div className="payment-form-grid card-payment-grid">
          <div className="field-group">
            <label className="label">Сумма</label>
            <input
              className="input"
              value={paymentAmount}
              onChange={(e) => onPaymentAmountChange(e.target.value)}
              placeholder="100.00"
              inputMode="decimal"
            />
          </div>

          <div className="field-group">
            <label className="label">Валюта</label>
            <select
              className="input"
              value={paymentCurrency}
              onChange={(e) => onPaymentCurrencyChange(e.target.value)}
            >
              {paymentCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="label">Срок карты</label>

            <div className="expiry-row">
              <select
                className="input"
                value={cardExpMonth}
                onChange={(e) => onCardExpMonthChange(e.target.value)}
              >
                <option value="">MM</option>
                {cardMonths.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                className="input"
                value={cardExpYear}
                onChange={(e) => onCardExpYearChange(e.target.value)}
              >
                <option value="">YYYY</option>
                {cardYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-group payment-form-card-number">
            <label className="label">Номер карты</label>
            <input
              className="input"
              value={cardNumber}
              onChange={(e) => onCardNumberChange(e.target.value)}
              placeholder="4111 1111 1111 1111"
              inputMode="numeric"
              maxLength={19}
            />
          </div>

          <div className="field-group">
            <label className="label">CVV</label>
            <input
              className="input"
              value={cardCvv}
              onChange={(e) => onCardCvvChange(e.target.value)}
              placeholder="123"
            />
          </div>
        </div>

        <div className="button-row payment-form-actions">
          <button
            className="secondary-button"
            onClick={onFillRandom}
            disabled={paymentCreating}
          >
            Заполнить случайно
          </button>

          <button
            className="primary-button"
            onClick={onCreatePayment}
            disabled={
              paymentCreating ||
              (!hasMerchantPortalSession && !apiKey.trim()) ||
              !paymentAmount.trim() ||
              !paymentCurrency.trim() ||
              !cardNumber.trim() ||
              !cardExpMonth.trim() ||
              !cardExpYear.trim() ||
              !cardCvv.trim()
            }
          >
            {paymentCreating ? "Создание..." : "Создать платёж"}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
}
