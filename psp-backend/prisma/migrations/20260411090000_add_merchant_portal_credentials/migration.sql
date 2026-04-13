ALTER TABLE "Merchant"
ADD COLUMN "email" TEXT,
ADD COLUMN "passwordHash" TEXT;

CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");
