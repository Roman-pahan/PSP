// import express from "express";
// //supertest  умеет “делать запросы” к Express без запуска сервера
// import request from "supertest";
// import { createMerchantRouter } from "../merchant/merchantRoutes";

// test("GET /health -> {status: ok}", async () => {
//   //создаем микроприложение
//   const app = express();
//   //ставим заглушку вместо аргумента
//   const prismaStub: any = {};

//   // подключаем роутер в приложение (теперь /health существует)
//   app.use(createMerchantRouter(prismaStub));

//   //Запускаем реальный http-сервер
//   const server = app.listen(0);
//   try {
//     // Делаем  запрос GET/health и проверяем ответ
//     await request(server).get("./health").expect(200).expect({ status: "ok" });
//   } catch {
//     await new Promise<void>((resolve, reject) => {
//       server.close((err) => (err ? reject(err) : resolve()));
//     });
//   }
// });
import express from "express";
import request from "supertest";
import { createMerchantRouter } from "../merchant/merchantRoutes";

test("GET /health -> {status: ok}", async () => {
  // создаем микроприложение
  const app = express();

  // заглушка вместо prisma
  const prismaStub: any = {};

  // подключаем роутер
  app.use(createMerchantRouter(prismaStub));

  // supertest сам поднимет приложение, сервер вручную не нужен
  await request(app).get("/health").expect(200).expect({ status: "ok" });
});
