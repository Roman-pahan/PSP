ALTER TABLE "Payment"
ADD COLUMN "merchantOrderId" TEXT;

CREATE INDEX "Payment_merchantId_merchantOrderId_idx"
ON "Payment"("merchantId", "merchantOrderId");

