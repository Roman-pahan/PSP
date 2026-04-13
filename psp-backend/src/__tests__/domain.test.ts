import {
  getMerchantOrThrow, // берёт мерчанта по apiKey или кидает ошибку
  getPaymentOrThrow, // берёт платёж по paymentId или кидает ошибку
  getPaymentForMerchantOrThrow, // берёт платёж и проверяет, что он принадлежит мерчанту
} from "../core/domain";

//Подключаем AppError, чтобы сравнивать "ожидаем" ошибки
import { AppError } from "../core/errors";

//Подключаем наш глубокий мок Prisma(чтобы не трогать реальную БД)
import { createPrismaMock } from "./helpers/prismaMock";

describe("core/domain.ts", () => {
  test("getPaymentForMerchantOrThrow -> возвращает платеж, если он принадлежит мерчанту", async () => {
    const prisma = createPrismaMock();

    const ownPayment = {
      id: "p1",
      merchantId: "m1",
      status: "CREATED",
    } as any;

    prisma.payment.findUnique.mockResolvedValue(ownPayment);
    prisma.payment.findFirst.mockResolvedValue(ownPayment);

    const result = await getPaymentForMerchantOrThrow(
      prisma as any,
      "p1",
      "m1",
    );

    expect(result.id).toBe("p1");
  });

  test("getPaymentForMerchantOrThrow -> кидает PAYMENT_NOT_FOUND, если платеж не найден", async () => {
    const prisma = createPrismaMock();

    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    await expect(
      getPaymentForMerchantOrThrow(prisma as any, "p_missing", "m1"),
    ).rejects.toEqual(AppError.paymentNotFound("p_missing"));
  });

  test("getMerchantOrThrow -> возвращает мерчанта, если он найден", async () => {
    //Создаем фейковую Prisma (все методы там jest.fn())
    const prisma = createPrismaMock();

    //Делаем "как будто" мерчант найден в базе
    const merchant = { id: "m1", name: "Test", apiKey: "mch_test" } as any;

    // ⚠️ В разных реализациях domain.ts могут использовать findUnique или findFirst
    // Поэтому мы подстраховываемся и задаём оба варианта
    prisma.merchant.findUnique.mockResolvedValue(merchant); // если внутри domain.ts используется findUnique
    prisma.merchant.findFirst.mockResolvedValue(merchant); // если внутри domain.ts используется findFirst

    //Вызываем функцию
    const result = await getMerchantOrThrow(prisma as any, "mch_test");

    // Проверяем, что вернулся нужный объект
    expect(result.id).toBe("m1");
  });

  test("getMerchantOrThrow -> кидает MERCHANT_NOT_FOUND, если мерчант не найден", async () => {
    //Фейковая Prisma
    const prisma = createPrismaMock();

    //"как будто" в базе ничего не нашли
    prisma.merchant.findUnique.mockResolvedValue(null as any);
    prisma.merchant.findFirst.mockResolvedValue(null as any);

    // Проверяем, что промис Реально падает с нужной AppStore
    await expect(
      getMerchantOrThrow(prisma as any, "mch_missing"),
    ).rejects.toEqual(AppError.merchantNotFound("mch_missing"));
  });

  test("getPaymentOrThrow -> возвращает платеж, если он найден", async () => {
    //Фейковая Prisma
    const prisma = createPrismaMock();

    //"как будто" платеж найден
    const payment = { id: "p1", merchantId: "m1", status: "CREATED" } as any;

    //Подстаховка по findUnique/findFirst
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.payment.findFirst.mockResolvedValue(payment);

    // Вызываем функцию
    const result = await getPaymentOrThrow(prisma as any, "p1");

    //Проверяем
    expect(result.id).toBe("p1");
  });

  test("getPaymentOrThrow -> кидает PAYMENT_NOT_FOUND, если платёж не найден", async () => {
    //Фейковая Prisma
    const prisma = createPrismaMock();

    //"как будто" не нашли
    prisma.payment.findUnique.mockResolvedValue(null as any);
    prisma.payment.findFirst.mockResolvedValue(null as any);

    //Ожидаем AppError.paymentNotFound
    await expect(getPaymentOrThrow(prisma as any, "p_missing")).rejects.toEqual(
      AppError.paymentNotFound("p_missing"),
    );
  });

  test("getPaymentForMerchantOrThrow -> кидает FORBIDDEN_PAYMENT_ACCESS, если платёж чужой", async () => {
    // Фейковая Prisma
    const prisma = createPrismaMock();

    // Платёж принадлежит ДРУГОМУ мерчанту
    const notOwnPayment = {
      id: "p1",
      merchantId: "m_other",
      status: "CREATED",
    } as any;

    // Возвращаем “чужой” платёж
    prisma.payment.findUnique.mockResolvedValue(notOwnPayment);
    prisma.payment.findFirst.mockResolvedValue(notOwnPayment);

    // Ожидаем AppError.forbiddenPaymentAccess (403)
    await expect(
      getPaymentForMerchantOrThrow(prisma as any, "p1", "m1"),
    ).rejects.toEqual(AppError.forbiddenPaymentAccess("p1", "m1")); //rejects берет причину падения
  });
});
