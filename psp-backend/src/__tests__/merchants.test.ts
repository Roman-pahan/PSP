import express from "express";
import request from "supertest";
import { createMerchantRouter } from "../merchant/merchantRoutes";
import { createPrismaMock } from "./helpers/prismaMock";
import { AppError } from "../core/errors";

jest.mock("../core/domain", () => ({
  getMerchantOrThrow: jest.fn(),
}));

import { getMerchantOrThrow } from "../core/domain";

test("GET /merchants => возвращает список мерчантов", async () => {
  //Создаем мок Prisma
  const prisma = createPrismaMock();
  //Настраиваем: когда вызовут prisma.merchant.findMany() - вернуть массив

  //говорим: авторизация по ключу прошла (ничего не кидаем)
  (getMerchantOrThrow as unknown as jest.Mock).mockResolvedValue({
    id: "m1",
    apiKey: "mch_test",
  });

  prisma.merchant.findMany.mockResolvedValue([
    //Тут нам важны только поля, которые реально уходят в res.json
    { id: "m1", name: "Test Merchant", apiKey: "mch_test" } as any,
  ]);

  // Создаем Express-приложение
  const app = express();

  //Подключаем роуты, передав мок prisma
  app.use(createMerchantRouter(prisma as any));

  //Запускаем сервер на свободном порту
  const server = app.listen(0);

  try {
    //Делаем запрос
    const res = await request(server)
      .get("/merchants")
      .set("x-api-key", "mch_test")
      .expect(200);

    //Проверяем: пришел ли массив
    expect(Array.isArray(res.body)).toBe(true);
    //Проверяем: есть наш мерчант
    expect(res.body[0].id).toBe("m1");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("GET /merchants -> если prisma падает, возвращает 500 INTERNAL", async () => {
  // 0) Временно выключаем console.error, чтобы тест не засорял вывод
  const consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});

  //говорим: авторизация по ключу прошла (ничего не кидаем)
  (getMerchantOrThrow as unknown as jest.Mock).mockResolvedValue({
    id: "m1",
    apiKey: "mch_test",
  });

  // 1) Поддельная Prisma
  const prismaStub: any = {
    merchant: {
      //2) Фейковая функцияЮ которую заставим упасть
      findMany: jest.fn(),
    },
  };

  // 3) Говорим: findMany не вернет данные, а выбросит ошибку
  prismaStub.merchant.findMany.mockRejectedValue(
    new Error("Внутренняя ошибка сервера"),
  );

  // 4) Собираем Express-приложение
  const app = express();

  // 5) Подключает роутер с нашей поддельной Prisma
  app.use(createMerchantRouter(prismaStub));

  // 6) Запускаем сервер
  const server = app.listen(0);

  try {
    // 7) Делаем запрос и ждём 500
    const res = await request(server)
      .get("/merchants")
      .set("x-api-key", "mch_test")
      .expect(500);
    //8) Проверяем, что ошибка в формате sendError
    expect(res.body).toEqual(expect.objectContaining({ error: "INTERNAL" }));
  } finally {
    //9) Закрываем сервер
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    consoleErrorSpy.mockRestore(); // 👈 возвращаем console.error назад
  }
});

test("GET /merchants -> если нет x-api-key, возвращает 400 VALIDATION_MISSING_FIELDS", async () => {
  // 1) Выключаем console.error, чтобы вывод не засорялся
  const consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});
  // 2) Prisma не важна, потому что до базы не дойдем(упадем раньше)
  const prisma = createPrismaMock();

  //3) Express-приложение
  const app = express();

  //4) Подключаем роутер
  app.use(createMerchantRouter(prisma as any));

  //5) Запускаем сервер
  const server = app.listen(0);

  try {
    //6) делаем запрос БЕЗ заголовка x-api-key
    const res = await request(server).get("/merchants").expect(400);

    //7) Проверяем формат ошибки (приходит из sendError)
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "VALIDATION_MISSING_FIELDS",
        group: "VALIDATION",
      }),
    );
  } finally {
    //8) Закрываем сервер
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    //9) Возвращаем console.error назад
    consoleErrorSpy.mockRestore();
  }
});

test("GET /merchants -> если ключ неверный, возвращает 401 INVALID_API_KEY", async () => {
  // 1) Выключаем console.error
  const consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});

  // 2) Prisma не важна — мы заставим domain упасть раньше
  const prisma = createPrismaMock();

  // 3) Говорим: getMerchantOrThrow падает с AppError.invalidApiKey
  (getMerchantOrThrow as unknown as jest.Mock).mockRejectedValue(
    AppError.invalidApiKey("bad-key"),
  );

  // 4) Express-приложение
  const app = express();

  // Подключаем роутер
  app.use(createMerchantRouter(prisma as any));

  // 6) Запускаем сервер
  const server = app.listen(0);

  try {
    //7) Делаем запрос с НЕверным ключом
    const res = await request(server)
      .get("/merchants")
      .set("x-api-key", "bad-key")
      .expect(401);

    // 8) Проверяем, что код ошибки правилньный
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "INVALID_API_KEY",
        group: "AUTH",
      }),
    );
  } finally {
    // 9) Закрываем сервер

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    //10) Возвращаем console.error назад
    consoleErrorSpy.mockRestore();
  }
});

test("POST /create -> успешно создаёт мерчанта", async () => {
  // 1) Создаём мок Prisma
  const prisma = createPrismaMock();

  // 2) Готовим фейковый результат create
  prisma.merchant.create.mockResolvedValue({
    id: "m_new", // id нового мерчанта
    name: "Test Merchant 3", // имя мерчанта
    apiKey: "mch_test_new", // сгенерированный apiKey
    createdAt: new Date("2026-03-29T00:00:00.000Z"), // дата создания
    updatedAt: new Date("2026-03-29T00:00:00.000Z"), // дата обновления
  } as any);

  // 3) Создаём Express-приложение
  const app = express();

  // 4) ВАЖНО: подключаем JSON body parser для POST body
  app.use(express.json());
  // 5) Подключаем merchant router
  app.use(createMerchantRouter(prisma as any));

  // 6) Поднимаем сервер на случайном порту
  const server = app.listen(0);
  try {
    // 7) Делаем POST запрос на создание мерчанта
    const res = await request(server)
      .post("/create")
      .send({
        name: "Test Merchant 3", // передаём имя
      })
      .expect(200);

    // 8) Проверяем, что prisma.merchant.create действительно вызвался
    expect(prisma.merchant.create).toHaveBeenCalledTimes(1);

    // 9) Проверяем, что в базу ушло имя
    expect(prisma.merchant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test Merchant 3",
        }),
      }),
    );
    //  10) Проверяем ответ
    expect(res.body).toEqual(
      expect.objectContaining({
        id: "m_new",
        name: "Test Merchant 3",
        apiKey: "mch_test_new",
      }),
    );
  } finally {
    // 11) Закрываем сервер
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("POST /create -> если не передан name, возвращает 400 VALIDATION_MISSING_FIELDS", async () => {
  // 1) Выключаем console.error, чтобы тест не шумел
  const consoleErrorSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => {});

  // 2) Создаём мок Prisma
  const prisma = createPrismaMock();

  // 3) Создаём Express-приложение
  const app = express();

  // 4) Подключаем JSON body parser
  app.use(express.json());

  // 5) Подключаем merchant router
  app.use(createMerchantRouter(prisma as any));

  // 6) Поднимаем сервер
  const server = app.listen(0);

  try {
    // 7) Делаем POST без name
    const res = await request(server).post("/create").send({}).expect(400);

    // 8) Проверяем формат ошибки
    expect(res.body).toEqual(
      expect.objectContaining({
        error: "VALIDATION_MISSING_FIELDS",
        group: "VALIDATION",
      }),
    );

    // 9) Проверяем, что prisma.merchant.create не вызывался
    expect(prisma.merchant.create).not.toHaveBeenCalled();
  } finally {
    // 10) Закрываем сервер
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // 11) Возвращаем console.error назад
    consoleErrorSpy.mockRestore();
  }
});
