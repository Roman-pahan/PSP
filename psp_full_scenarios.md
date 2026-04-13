# 📘 Полный сценарный набор PSP (AUTO MODE)

## 🔧 ENV настройки

```
PROCESS_MODE=auto
CAPTURE_MODE=auto
MOCK_BANK_DISABLE_WEBHOOK=0
```

## 🕒 Тайминги

```js
const BANK_PAYMENT_PROCESSING_MS = 10000;
const MERCH_PAYMENT_TIMEOUT_MS = 60000;
const MERCH_PAYMENT_TIMEOUTCHECKLIST_MS = 30000;
```

---

# ✅ СЦЕНАРИЙ 1 — УСПЕШНЫЙ AUTH + CAPTURE (AUTO)

## Ввод (init)

```bash
curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "amount": 3999.10,
    "currency": "EUR",
    "cardNumber": "4484 6132 9011 5520",
    "expMonth": 12,
    "expYear": 2032,
    "cvv": "414"
  }'
```

### Ход сценария

1. created → **10 сек**
2. processing → **банк отвечает через 10 сек**
3. authorized → **capture через 10 сек**
4. captured (финал)

---

# ❌ СЦЕНАРИЙ 2 — DECLINED

## Ввод (init)

```bash
curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "amount": 8200.55,
    "currency": "EUR",
    "cardNumber": "4539 9220 1112 3388",
    "expMonth": 10,
    "expYear": 2033,
    "cvv": "771"
  }'
```

### Ход сценария

1. created
2. processing
3. declined (банк прислал отказ)

---

# ⏳ СЦЕНАРИЙ 3 — TIMEOUT (банк молчит)

.env:

```
MOCK_BANK_DISABLE_WEBHOOK=1
```

## Ввод

```bash
curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "amount": 2001.40,
    "currency": "EUR",
    "cardNumber": "4716 5201 4432 1150",
    "expMonth": 05,
    "expYear": 2031,
    "cvv": "131"
  }'
```

### Ход сценария

1. created
2. processing
3. **банк молчит → webhooks нет**
4. через 60 сек → timeout

---

# 🔁 СЦЕНАРИЙ 4 — RETRY ПОСЛЕ ERROR

## Эта ошибка возникает автоматически, если PSP не может отправить банк‑вебхук.

.env:

```
UPSTREAM_WEBHOOK_URL="http://localhost:3999/not-exist"
```

## Ввод init

```bash
curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "amount": 3550.20,
    "currency": "EUR",
    "cardNumber": "4484 7732 1020 5504",
    "expMonth": 11,
    "expYear": 2031,
    "cvv": "608"
  }'
```

### После ERROR выполнить retry:

```bash
curl -X POST "http://localhost:3000/payment/retry"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "paymentId": "ID_ОТСЮДА"
  }'
```

---

# 🚫 СЦЕНАРИЙ 5 — CANCEL ДО AUTHORIZED

(мерчант отменяет платёж)

## Ввод init:

```bash
curl -X POST "http://localhost:3000/payment/init"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "amount": 2700.00,
    "currency": "EUR",
    "cardNumber": "4556 3201 9912 6640",
    "expMonth": 09,
    "expYear": 2032,
    "cvv": "992"
  }'
```

## Cancel (в первые 10 сек):

```bash
curl -X POST "http://localhost:3000/payment/cancel"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "paymentId": "ID"
  }'
```

---

# ↩️ СЦЕНАРИЙ 6 — REFUND после CAPTURE

(мерчант делает возврат)

## Refund:

```bash
curl -X POST "http://localhost:3000/payment/refund"   -H "Content-Type: application/json"   -d '{
    "apiKey": "mch_97c15072956e326febe2694ecefb398d",
    "paymentId": "ID"
  }'
```

---

# ⚠️ СЦЕНАРИЙ 7 — CHARGEBACK (банк откатил платёж)

(эмулируем через ручной вызов вебхука)

```bash
curl -X POST "http://localhost:3000/webhook/upstream/payment-result"   -H "Content-Type: application/json"   -H "x-webhook-sign: 094be207fa8af92f9869ece7e16deb7cd296db9c46b7febfba9f51bc6a39a215"   -d '{
    "paymentId": "ID",
    "status": "chargeback",
    "bankTransactionId": "BNK_CHB_551122"
  }'
```
