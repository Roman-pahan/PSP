import express from "express";
import request from "supertest";
import { createMerchantPortalRouter } from "../merchant/merchantPortalRoutes";
import { createPrismaMock } from "./helpers/prismaMock";

describe("merchant portal routes", () => {
  test("GET /bootstrap-status -> returns closed self-register after first merchant exists", async () => {
    const prisma = createPrismaMock();
    prisma.merchant.count.mockResolvedValue(1 as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server).get("/bootstrap-status").expect(200);

      expect(res.body).toEqual({
        ok: true,
        canSelfRegister: false,
        merchantsCount: 1,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /register -> создаёт мерчанта кабинета и возвращает токен", async () => {
    const prisma = createPrismaMock();

    prisma.merchant.count.mockResolvedValue(0 as any);
    prisma.merchant.findUnique.mockResolvedValueOnce(null as any);
    prisma.merchant.create.mockResolvedValue({
      id: "m_portal_1",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_1234567890abcdef1234567890abcd",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/register")
        .send({
          name: "Portal Merchant",
          email: "merchant@test.com",
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.merchant).toEqual(
        expect.objectContaining({
          id: "m_portal_1",
          name: "Portal Merchant",
          email: "merchant@test.com",
        }),
      );
      expect(prisma.merchant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Portal Merchant",
            email: "merchant@test.com",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /register -> blocks public self-registration after bootstrap", async () => {
    const prisma = createPrismaMock();
    prisma.merchant.count.mockResolvedValue(2 as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/register")
        .send({
          name: "Portal Merchant",
          email: "merchant@test.com",
          password: "strongpass123",
        })
        .expect(400);

      expect(res.body.error).toBe("VALIDATION_INVALID_VALUE");
      expect(String(res.body.message)).toContain("Публичная регистрация мерчанта закрыта");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> возвращает токен для существующего мерчанта", async () => {
    const prisma = createPrismaMock();
    const { hashPortalPassword } = await import("../merchant/merchantPortalAuth");

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_2",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: hashPortalPassword("strongpass123"),
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/login")
        .send({
          email: "merchant@test.com",
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.merchant.email).toBe("merchant@test.com");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /me -> без bearer token возвращает 401", async () => {
    const prisma = createPrismaMock();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server).get("/me").expect(401);

      expect(res.body).toEqual(
        expect.objectContaining({
          error: "INVALID_PORTAL_TOKEN",
          group: "AUTH",
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      consoleErrorSpy.mockRestore();
    }
  });

  test("GET /overview -> возвращает профиль и summary по токену кабинета", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_3",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    prisma.payment.findMany.mockResolvedValue([
      {
        id: "p1",
        amount: "100.00",
        currency: "EUR",
        status: "captured",
        providerCode: "mock_bank",
        upstreamStatus: "captured",
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
        updatedAt: new Date("2026-04-11T10:00:00.000Z"),
      } as any,
      {
        id: "p2",
        amount: "50.00",
        currency: "EUR",
        status: "authorized",
        providerCode: "fake_bank",
        upstreamStatus: "authorized",
        createdAt: new Date("2026-04-11T11:00:00.000Z"),
        updatedAt: new Date("2026-04-11T11:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_3",
      email: "merchant@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/overview")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.merchant.id).toBe("m_portal_3");
      expect(res.body.summary.totalCount).toBe(2);
      expect(res.body.summary.byStatus.captured).toBe(1);
      expect(res.body.summary.byProvider.mock_bank).toBe(1);
      expect(res.body.recentPayments).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("PATCH /profile -> обновляет name/email и возвращает новый token", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique
      .mockResolvedValueOnce({
        id: "m_portal_4",
        name: "Portal Merchant",
        email: "merchant@test.com",
        apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
        passwordHash: "salt:hash",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any)
      .mockResolvedValueOnce(null as any);

    prisma.merchant.update.mockResolvedValue({
      id: "m_portal_4",
      name: "Lucky Spin",
      email: "owner@luckyspin.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    } as any);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_4",
      email: "merchant@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .patch("/profile")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Lucky Spin",
          email: "owner@luckyspin.com",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.merchant).toEqual(
        expect.objectContaining({
          name: "Lucky Spin",
          email: "owner@luckyspin.com",
        }),
      );
      expect(prisma.merchant.update).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /rotate-api-key -> ротирует apiKey и возвращает masked key", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );
    const { hashPortalPassword } = await import("../merchant/merchantPortalAuth");
    const { generateTotpCode } = await import("../admin/totp");
    const secret = "JBSWY3DPEHPK3PXP";

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_5",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: hashPortalPassword("strongpass123"),
      twoFactorSecret: secret,
      twoFactorEnabled: true,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    prisma.merchant.update.mockResolvedValue({
      id: "m_portal_5",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_rotated1234567890abcdef1234567890",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    } as any);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_5",
      email: "merchant@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/rotate-api-key")
        .set("Authorization", `Bearer ${token}`)
        .send({
          password: "strongpass123",
          code: generateTotpCode(secret),
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.merchant.apiKeyMasked).toContain("mch_ro");
      expect(prisma.merchant.update).toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> требует 2FA код, если он включён у owner", async () => {
    const prisma = createPrismaMock();
    const { hashPortalPassword } = await import("../merchant/merchantPortalAuth");
    const { generateTotpCode } = await import("../admin/totp");
    const secret = "JBSWY3DPEHPK3PXP";

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_2fa",
      name: "Portal Merchant",
      email: "merchant@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: hashPortalPassword("strongpass123"),
      twoFactorSecret: secret,
      twoFactorEnabled: true,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      await request(server)
        .post("/login")
        .send({
          email: "merchant@test.com",
          password: "strongpass123",
        })
        .expect(401);

      const res = await request(server)
        .post("/login")
        .send({
          email: "merchant@test.com",
          password: "strongpass123",
          twoFactorCode: generateTotpCode(secret),
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.merchant.email).toBe("merchant@test.com");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /login -> возвращает сессию merchant user для manager", async () => {
    const prisma = createPrismaMock();
    const { hashPortalPassword } = await import("../merchant/merchantPortalAuth");

    (prisma as any).merchantUser.findUnique.mockResolvedValue({
      id: "mu_1",
      merchantId: "m_portal_6",
      email: "manager@test.com",
      passwordHash: hashPortalPassword("strongpass123"),
      role: "manager",
      isActive: true,
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_6",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/login")
        .send({
          email: "manager@test.com",
          password: "strongpass123",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.merchant.currentUser.role).toBe("manager");
      expect(res.body.merchant.currentUser.email).toBe("manager@test.com");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /users -> owner видит legacy owner и команду мерчанта", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).merchantUser.findMany.mockResolvedValue([
      {
        id: "mu_2",
        merchantId: "m_portal_7",
        email: "manager@test.com",
        passwordHash: "salt:hash",
        role: "manager",
        isActive: true,
        createdAt: new Date("2026-04-11T01:00:00.000Z"),
        updatedAt: new Date("2026-04-11T01:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/users")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].role).toBe("owner");
      expect(res.body.items[1].role).toBe("manager");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /payments/list -> owner can filter and sort merchant payments", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_list_1",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    prisma.payment.count.mockResolvedValue(1 as any);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: "payment_1",
        amount: "120.00",
        currency: "EUR",
        status: "captured",
        providerCode: "mock_bank",
        upstreamId: "up_1",
        upstreamStatus: "captured",
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
        updatedAt: new Date("2026-04-11T10:30:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_list_1",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get(
          "/payments/list?status=captured&providerCode=mock_bank&search=up_1&sortBy=amount&sortOrder=asc&limit=10&page=1",
        )
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.count).toBe(1);
      expect(res.body.filters).toEqual({
        status: "captured",
        providerCode: "mock_bank",
        search: "up_1",
        sortBy: "amount",
        sortOrder: "asc",
        limit: 10,
      });
      expect(prisma.payment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            merchantId: "m_portal_list_1",
            status: "captured",
            providerCode: "mock_bank",
            OR: expect.any(Array),
          }),
        }),
      );
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { amount: "asc" },
          take: 10,
          skip: 0,
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> owner видит только audit своего мерчанта", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.findMany.mockResolvedValue([
      {
        id: "audit_1",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
        },
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
      } as any,
      {
        id: "audit_2",
        actorType: "merchant_user",
        actorId: "mu_77",
        action: "merchant_user_created",
        entityType: "merchant_user",
        entityId: "mu_77",
        payload: {
          merchantId: "m_portal_7",
          userEmail: "manager@test.com",
        },
        createdAt: new Date("2026-04-11T11:00:00.000Z"),
      } as any,
      {
        id: "audit_3",
        actorType: "merchant_owner",
        actorId: "other_merchant",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "another_merchant",
        payload: {
          merchantId: "another_merchant",
        },
        createdAt: new Date("2026-04-11T12:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/audit-logs")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((item: any) => item.id)).toEqual([
        "audit_2",
        "audit_1",
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> owner can filter merchant audit by action and query", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.findMany.mockResolvedValue([
      {
        id: "audit_1",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
          merchantEmail: "owner@test.com",
        },
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
      } as any,
      {
        id: "audit_2",
        actorType: "merchant_user",
        actorId: "mu_77",
        action: "merchant_user_created",
        entityType: "merchant_user",
        entityId: "mu_77",
        payload: {
          merchantId: "m_portal_7",
          userEmail: "manager@test.com",
        },
        createdAt: new Date("2026-04-11T11:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/audit-logs?action=merchant_user_created&query=manager")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe("audit_2");
      expect(res.body.filters).toEqual({
        action: "merchant_user_created",
        query: "manager",
        dateFrom: null,
        dateTo: null,
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: 20,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> owner gets paginated merchant audit logs", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `audit_${index + 1}`,
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
        },
        createdAt: new Date(`2026-04-11T1${index}:00:00.000Z`),
      })) as any,
    );

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/audit-logs?page=2&limit=2")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.page).toBe(2);
      expect(res.body.totalPages).toBe(3);
      expect(res.body.totalCount).toBe(5);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe("audit_3");
      expect(res.body.items[1].id).toBe("audit_2");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> owner can filter merchant audit by date range", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.findMany.mockResolvedValue([
      {
        id: "audit_old",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
        },
        createdAt: new Date("2026-04-09T10:00:00.000Z"),
      } as any,
      {
        id: "audit_in_range",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
        },
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
      } as any,
      {
        id: "audit_future",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_profile_updated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: {
          merchantId: "m_portal_7",
        },
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/audit-logs?dateFrom=2026-04-10&dateTo=2026-04-12")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe("audit_in_range");
      expect(res.body.filters).toEqual({
        action: null,
        query: null,
        dateFrom: "2026-04-10",
        dateTo: "2026-04-12",
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: 20,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("GET /audit-logs -> owner can sort merchant audit logs", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_7",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.findMany.mockResolvedValue([
      {
        id: "audit_b",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_user_created",
        entityType: "merchant_user",
        entityId: "mu_2",
        payload: { merchantId: "m_portal_7" },
        createdAt: new Date("2026-04-11T11:00:00.000Z"),
      } as any,
      {
        id: "audit_a",
        actorType: "merchant_owner",
        actorId: "m_portal_7",
        action: "merchant_api_key_rotated",
        entityType: "merchant",
        entityId: "m_portal_7",
        payload: { merchantId: "m_portal_7" },
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
      } as any,
    ]);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_7",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .get("/audit-logs?sortBy=action&sortOrder=asc")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.items.map((item: any) => item.id)).toEqual([
        "audit_a",
        "audit_b",
      ]);
      expect(res.body.filters).toEqual({
        action: null,
        query: null,
        dateFrom: null,
        dateTo: null,
        sortBy: "action",
        sortOrder: "asc",
        limit: 20,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("POST /users -> owner создаёт merchant user", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique
      .mockResolvedValueOnce({
        id: "m_portal_8",
        name: "Portal Merchant",
        email: "owner@test.com",
        apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
        passwordHash: "salt:hash",
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      } as any)
      .mockResolvedValueOnce(null as any);
    (prisma as any).merchantUser.findUnique.mockResolvedValue(null as any);
    (prisma as any).merchantUser.create.mockResolvedValue({
      id: "mu_3",
      merchantId: "m_portal_8",
      email: "readonly@test.com",
      passwordHash: "salt:hash",
      role: "readonly",
      isActive: true,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "audit-merchant-user-create" } as any);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_8",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "readonly@test.com",
          password: "strongpass123",
          role: "readonly",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.email).toBe("readonly@test.com");
      expect(res.body.user.role).toBe("readonly");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_user_created",
            entityId: "mu_3",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("PATCH /users/:userId/deactivate -> owner deactivates merchant user", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_9",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).merchantUser.findUnique.mockResolvedValue({
      id: "mu_4",
      merchantId: "m_portal_9",
      email: "manager@test.com",
      passwordHash: "salt:hash",
      role: "manager",
      isActive: true,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    } as any);
    (prisma as any).merchantUser.update.mockResolvedValue({
      id: "mu_4",
      merchantId: "m_portal_9",
      email: "manager@test.com",
      passwordHash: "salt:hash",
      role: "manager",
      isActive: false,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      updatedAt: new Date("2026-04-11T02:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "audit-merchant-user-deactivate" } as any);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_9",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .patch("/users/mu_4/deactivate")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.isActive).toBe(false);
      expect(res.body.user.email).toBe("manager@test.com");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_user_deactivated",
            entityId: "mu_4",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  test("PATCH /users/:userId/role -> owner changes merchant user role", async () => {
    const prisma = createPrismaMock();
    const { createMerchantPortalToken } = await import(
      "../merchant/merchantPortalAuth"
    );

    prisma.merchant.findUnique.mockResolvedValue({
      id: "m_portal_10",
      name: "Portal Merchant",
      email: "owner@test.com",
      apiKey: "mch_abcdefabcdefabcdefabcdefabcdefab",
      passwordHash: "salt:hash",
      createdAt: new Date("2026-04-11T00:00:00.000Z"),
      updatedAt: new Date("2026-04-11T00:00:00.000Z"),
    } as any);
    (prisma as any).merchantUser.findUnique.mockResolvedValue({
      id: "mu_5",
      merchantId: "m_portal_10",
      email: "manager@test.com",
      passwordHash: "salt:hash",
      role: "manager",
      isActive: true,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      updatedAt: new Date("2026-04-11T01:00:00.000Z"),
    } as any);
    (prisma as any).merchantUser.update.mockResolvedValue({
      id: "mu_5",
      merchantId: "m_portal_10",
      email: "manager@test.com",
      passwordHash: "salt:hash",
      role: "readonly",
      isActive: true,
      createdAt: new Date("2026-04-11T01:00:00.000Z"),
      updatedAt: new Date("2026-04-11T02:00:00.000Z"),
    } as any);
    (prisma as any).auditLog.create.mockResolvedValue({ id: "audit-merchant-user-role" } as any);

    const token = createMerchantPortalToken({
      merchantId: "m_portal_10",
      email: "owner@test.com",
      role: "owner",
    });

    const app = express();
    app.use(express.json());
    app.use(createMerchantPortalRouter(prisma as any));

    const server = app.listen(0);

    try {
      const res = await request(server)
        .patch("/users/mu_5/role")
        .set("Authorization", `Bearer ${token}`)
        .send({
          role: "readonly",
        })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe("readonly");
      expect((prisma as any).auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "merchant_user_role_updated",
            entityId: "mu_5",
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
