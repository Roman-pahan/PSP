CREATE TABLE "PspUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PspUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PspUser_email_key" ON "PspUser"("email");
