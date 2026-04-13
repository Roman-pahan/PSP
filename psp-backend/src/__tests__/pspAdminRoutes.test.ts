import express from "express";
import request from "supertest";
import { createPspAdminRouter } from "../admin/pspAdminRoutes";
import { createPrismaMock } from "./helpers/prismaMock";
import { hashAdminPassword } from "../admin/pspAdminAuth";
import { generateTotpCode, hashRecoveryCodes, serializeRecoveryCodeHashes } from "../admin/totp";
import { disconnectRateLimitRedis, resetRateLimitBuckets } from "../core/rateLimit";

describe("psp admin routes", () => {
  beforeEach(() => {
    resetRateLimitBuckets();
    delete process.env.REDIS_URL;
  });

  afterAll(async () => {
    await disconnectRateLimitRedis();
  });

  test("POST /register -> creates PSP admin and returns token", async () => {
    const prisma = createPrismaMock();

    (prisma as any).pspUser.count.mockResolvedValue(0 as any);
    (prisma as any).pspUser.findUnique.mockResolvedValueOnce(null);
    (prisma as any).pspUser.create.mockResolvedValue({
      id: "u1",
      email: "admin@test.com",
      role: "admin",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a1" } as any);

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/register")
        .send({
          email: "admin@test.com",
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user.email).toBe("admin@test.com");
      expect((prisma as any).auditLog.create).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /bootstrap-status -> returns open bootstrap when no PSP users exist", async () => {
    const prisma = createPrismaMock();
    (prisma as any).pspUser.count.mockResolvedValue(0 as any);

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server).get("/bootstrap-status").expect(200);

      expect(res.body).toEqual({
        ok: true,
        canSelfRegister: true,
        usersCount: 0,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /register -> admin can create support user without switching own session", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.count.mockResolvedValue(1 as any);
    (prisma as any).pspUser.findUnique
      .mockResolvedValueOnce({
        id: "admin-1",
        email: "admin@test.com",
        role: "admin",
        passwordHash: hashAdminPassword("strongpass123"),
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      })
      .mockResolvedValueOnce(null);
    (prisma as any).pspUser.create.mockResolvedValue({
      id: "u-support",
      email: "support@test.com",
      role: "support",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a-create-support" } as any);

    const token = createPspAdminToken("admin-1", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/register")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "support@test.com",
          password: "strongpass123",
          role: "support",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe("support");
      expect(res.body.token).toBeNull();
      expect(res.headers["set-cookie"]).toBeUndefined();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /overview -> returns merchants and payments for PSP admin", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u2",
      email: "admin@test.com",
      role: "admin",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    prisma.merchant.findMany.mockResolvedValue([
      {
        id: "m1",
        name: "Merchant 1",
        email: "m1@test.com",
        apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any,
    ]);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: "p1",
        merchantId: "m1",
        amount: "100.00",
        currency: "EUR",
        status: "captured",
        providerCode: "mock_bank",
        upstreamStatus: "captured",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any,
    ]);
    prisma.merchant.count.mockResolvedValue(1 as any);
    prisma.payment.count.mockResolvedValue(1 as any);

    const token = createPspAdminToken("u2", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .get("/overview")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.email).toBe("admin@test.com");
      expect(res.body.summary.merchantsCount).toBe(1);
      expect(res.body.summary.paymentsCount).toBe(1);
      expect(res.body.merchants).toHaveLength(1);
      expect(res.body.recentPayments).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /merchants/:merchantId/reveal-api-key -> requires password confirmation", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u3",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a2" } as any);

    const token = createPspAdminToken("u3", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/merchants/m1/reveal-api-key")
        .set("Authorization", `Bearer ${token}`)
        .send({
          password: "wrongpass123",
        })
        .expect(401);

      expect(res.body.error).toBe("INVALID_ADMIN_PASSWORD_CONFIRMATION");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_api_key_reveal_denied",
            entityId: "m1",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /merchants/:merchantId/reveal-api-key -> returns api key after password confirmation", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u4",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    prisma.merchant.findUnique.mockResolvedValue({
      id: "m1",
      name: "Merchant 1",
      email: "m1@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a3" } as any);

    const token = createPspAdminToken("u4", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/merchants/m1/reveal-api-key")
        .set("Authorization", `Bearer ${token}`)
        .send({
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.apiKey).toBe("mch_abcdefabcdefabcdefabcdefabcdefab");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_api_key_revealed",
            entityId: "m1",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> requires 2FA code when enabled", async () => {
    const prisma = createPrismaMock();

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u5",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: true,
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/login")
        .send({
          email: "admin@test.com",
          password: "strongpass123",
        })
        .expect(401);

      expect(res.body.error).toBe("TWO_FACTOR_REQUIRED");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /2fa/setup -> returns secret and provisioning url", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u6",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).pspUser.update.mockResolvedValue({
      id: "u6",
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a4" } as any);

    const token = createPspAdminToken("u6", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/2fa/setup")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.secret).toBe("string");
      expect(res.body.secret.length).toBeGreaterThan(10);
      expect(String(res.body.otpauthUrl)).toContain("otpauth://totp/");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /2fa/enable -> enables 2FA with valid password and code", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");
    const secret = "JBSWY3DPEHPK3PXP";

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u7",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: false,
      twoFactorSecret: secret,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).pspUser.update.mockResolvedValue({
      id: "u7",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorRecoveryCodes: "[\"hash1\",\"hash2\"]",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a5" } as any);

    const token = createPspAdminToken("u7", "admin@test.com", "admin");
    const code = generateTotpCode(secret);

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/2fa/enable")
        .set("Authorization", `Bearer ${token}`)
        .send({
          password: "strongpass123",
          code,
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.twoFactorEnabled).toBe(true);
      expect(Array.isArray(res.body.recoveryCodes)).toBe(true);
      expect(res.body.recoveryCodes).toHaveLength(8);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> accepts recovery code and rotates remaining list", async () => {
    const prisma = createPrismaMock();

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u8",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: true,
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      twoFactorRecoveryCodes: serializeRecoveryCodeHashes(
        hashRecoveryCodes(["ABCDE-12345"]),
      ),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).pspUser.update.mockResolvedValue({ id: "u8" } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a6" } as any);

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/login")
        .send({
          email: "admin@test.com",
          password: "strongpass123",
          twoFactorCode: "ABCDE-12345",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect((prisma as any).pspUser.update).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> rate limits repeated attempts", async () => {
    const prisma = createPrismaMock();

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u9",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      twoFactorEnabled: false,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a7" } as any);

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(server)
          .post("/login")
          .send({
            email: "admin@test.com",
            password: "strongpass123",
          })
          .expect(200);
      }

      const limited = await request(server)
        .post("/login")
        .send({
          email: "admin@test.com",
          password: "strongpass123",
        })
        .expect(429);

      expect(limited.body.error).toBe("TOO_MANY_REQUESTS");
      expect(limited.body.details.scope).toBe("psp_admin_login");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "psp_admin_rate_limited",
            entityId: "psp_admin_login",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /merchants/:merchantId/reveal-api-key -> rate limits repeated reveals", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u10",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    prisma.merchant.findUnique.mockResolvedValue({
      id: "m1",
      name: "Merchant 1",
      email: "m1@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a8" } as any);

    const token = createPspAdminToken("u10", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(server)
          .post("/merchants/m1/reveal-api-key")
          .set("Authorization", `Bearer ${token}`)
          .send({
            password: "strongpass123",
          })
          .expect(200);
      }

      const limited = await request(server)
        .post("/merchants/m1/reveal-api-key")
        .set("Authorization", `Bearer ${token}`)
        .send({
          password: "strongpass123",
        })
        .expect(429);

      expect(limited.body.error).toBe("TOO_MANY_REQUESTS");
      expect(limited.body.details.scope).toBe("psp_admin_reveal_api_key");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /security/status -> returns rate limit diagnostics", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u11",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const token = createPspAdminToken("u11", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .get("/security/status")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.rateLimit).toEqual(
        expect.objectContaining({
          configuredBackend: expect.any(String),
          activeBackend: expect.any(String),
          redisConfigured: expect.any(Boolean),
          redisFallbackActive: expect.any(Boolean),
          memoryBucketCount: expect.any(Number),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> support is forbidden", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u12",
      email: "support@test.com",
      role: "support",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const token = createPspAdminToken("u12", "support@test.com", "support");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .get("/audit-logs")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(res.body.error).toBe("FORBIDDEN_ADMIN_ACTION");
      expect(res.body.details.action).toBe("list_audit_logs");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /users -> risk is forbidden", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u13",
      email: "risk@test.com",
      role: "risk",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const token = createPspAdminToken("u13", "risk@test.com", "risk");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .get("/users")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(res.body.error).toBe("FORBIDDEN_ADMIN_ACTION");
      expect(res.body.details.action).toBe("list_psp_users");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /security/status -> support is forbidden", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u14",
      email: "support@test.com",
      role: "support",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const token = createPspAdminToken("u14", "support@test.com", "support");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .get("/security/status")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);

      expect(res.body.error).toBe("FORBIDDEN_ADMIN_ACTION");
      expect(res.body.details.action).toBe("view_security_status");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /payments and /merchants -> support can still view operational data", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u15",
      email: "support@test.com",
      role: "support",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    prisma.payment.findMany.mockResolvedValue([
      {
        id: "p1",
        merchantId: "m1",
        amount: "100.00",
        currency: "EUR",
        status: "captured",
        providerCode: "mock_bank",
        upstreamStatus: "captured",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any,
    ]);
    prisma.payment.count.mockResolvedValue(1 as any);
    prisma.merchant.findMany.mockResolvedValue([
      {
        id: "m1",
        name: "Merchant 1",
        email: "m1@test.com",
        apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any,
    ]);

    const token = createPspAdminToken("u15", "support@test.com", "support");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const paymentsRes = await request(server)
        .get("/payments?page=1&limit=20&status=captured&providerCode=mock_bank&search=m1&sortBy=createdAt&sortOrder=desc")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const merchantsRes = await request(server)
        .get("/merchants")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(paymentsRes.body.items).toHaveLength(1);
      expect(paymentsRes.body.totalCount).toBe(1);
      expect(paymentsRes.body.totalPages).toBe(1);
      expect(paymentsRes.body.filters.status).toBe("captured");
      expect(paymentsRes.body.filters.providerCode).toBe("mock_bank");
      expect(paymentsRes.body.items[0].merchantId).toBe("m1");
      expect(prisma.payment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "captured",
            providerCode: "mock_bank",
          }),
        }),
      );
      expect(merchantsRes.body.items).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /merchants -> admin can create merchant portal account", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u17",
      email: "admin@test.com",
      role: "admin",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    prisma.merchant.findUnique.mockResolvedValue(null as any);
    prisma.merchant.create.mockResolvedValue({
      id: "m-new-1",
      name: "Lucky Spin",
      email: "owner@luckyspin.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "a-merchant-create" } as any);

    const token = createPspAdminToken("u17", "admin@test.com", "admin");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/merchants")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Lucky Spin",
          email: "owner@luckyspin.com",
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.merchant).toEqual(
        expect.objectContaining({
          id: "m-new-1",
          name: "Lucky Spin",
          email: "owner@luckyspin.com",
          apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
        }),
      );
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_created_by_psp_admin",
            entityId: "m-new-1",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /merchants -> support is forbidden to create merchant", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u18",
      email: "support@test.com",
      role: "support",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });

    const token = createPspAdminToken("u18", "support@test.com", "support");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const res = await request(server)
        .post("/merchants")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Lucky Spin",
          email: "owner@luckyspin.com",
          password: "strongpass123",
        })
        .expect(403);

      expect(res.body.error).toBe("FORBIDDEN_ADMIN_ACTION");
      expect(res.body.details.action).toBe("create_merchant");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs and /security/status -> risk can view security surfaces", async () => {
    const prisma = createPrismaMock();
    const { createPspAdminToken } = await import("../admin/pspAdminAuth");

    (prisma as any).pspUser.findUnique.mockResolvedValue({
      id: "u16",
      email: "risk@test.com",
      role: "risk",
      passwordHash: hashAdminPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    });
    (prisma as any).auditLog.findMany.mockResolvedValue([
      {
        id: "a-risk-1",
        actorType: "psp_user",
        actorId: "u16",
        action: "psp_user_logged_in",
        entityType: "psp_user",
        entityId: "u16",
        payload: null,
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any,
    ]);

    const token = createPspAdminToken("u16", "risk@test.com", "risk");

    const app = express();
    app.use(express.json());
    app.use(createPspAdminRouter(prisma as any));

    const server = app.listen(0);
    try {
      const auditRes = await request(server)
        .get("/audit-logs")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const securityRes = await request(server)
        .get("/security/status")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(auditRes.body.items).toHaveLength(1);
      expect(securityRes.body.rateLimit).toEqual(
        expect.objectContaining({
          activeBackend: expect.any(String),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
