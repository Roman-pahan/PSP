// Набор возможных статусов платежа
export const PAYMENT_STATUS = {
  CREATED: "created",
  PROCESSING: "processing",
  AUTHORIZED: "authorized",
  CAPTURED: "captured",
  DECLINED: "declined",
  ERROR: "error",
  TIMEOUT: "timeout",
  CANCELED: "canceled",
  REFUNDED: "refunded",
  CHARGEBACK: "chargeback",
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
