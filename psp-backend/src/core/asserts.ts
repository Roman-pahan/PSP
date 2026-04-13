import { PAYMENT_STATUS, PaymentStatus } from "./statuses";

export function assertStatus(
  actual: PaymentStatus,
  allowed: PaymentStatus[],
  action: string,
) {
  if (!allowed.includes(actual)) {
    throw new Error(`Некорректный статус для ${action}: ${actual}`);
  }
}

export const statusRules = {
  cancel: {
    allowed: [
      PAYMENT_STATUS.CREATED,
      PAYMENT_STATUS.PROCESSING,
      PAYMENT_STATUS.AUTHORIZED,
    ] as PaymentStatus[],
    ensure(status: PaymentStatus) {
      assertStatus(status, this.allowed, "Отмена платежа");
    },
  },

  retry: {
    allowed: [PAYMENT_STATUS.ERROR, PAYMENT_STATUS.TIMEOUT] as PaymentStatus[],
    ensure(status: PaymentStatus) {
      assertStatus(status, this.allowed, "Повторный отправки в банк");
    },
  },

  refund: {
    allowed: [PAYMENT_STATUS.CAPTURED] as PaymentStatus[],
    ensure(status: PaymentStatus) {
      assertStatus(status, this.allowed, "Возврат средств");
    },
  },

  capture: {
    allowed: [PAYMENT_STATUS.AUTHORIZED] as PaymentStatus[],
    ensure(status: PaymentStatus) {
      assertStatus(status, this.allowed, "Списание средств");
    },
  },

  chargeback: {
    allowed: [PAYMENT_STATUS.CAPTURED] as PaymentStatus[],
    ensure(status: PaymentStatus) {
      assertStatus(status, this.allowed, "Возврат по запросу клиента");
    },
  },
} as const;
