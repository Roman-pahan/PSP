//Импортируем функцию которую тестируем
import { sendError } from "../core/httpError";

//Импортируем AppError, чтобы создать "нашу" ошибку
import { AppError } from "../core/errors";

test("sendError -> если AppError, ставит статус из ошибки и возвращает message", () => {
  // 1) Делаем фейковый res.status(), который возвращает res(чтобы работала цепочка res.status(...).json(...)
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  //2) Создаем AppError (например 401)
  const err = AppError.invalidApiKey("bad-key"); //у него httpStatus = 401 и message задан

  //3) Вызываем функцию
  sendError(res, err);

  // 4) Проверяем: вернули JSON где есть message (и вообще какая-то error-метка)
  expect(res.status).toHaveBeenCalledWith(err.httpStatus);
  // 5) Проверяем: в json ушёл объект с message и error
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      message: err.message,
      error: expect.any(String),
    }),
  );
});

test('sendError -> если обычная ошибка, возвращает 500 и error: "INTERNAL"', () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  // 1) Фейковый res
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  // 2)Обычная ошибка (не AppError)
  const err = new Error("boom");

  // 3) Вызываем
  sendError(res, err);

  // 4) Должен быть 500
  expect(res.status).toHaveBeenCalledWith(500);

  //5) В JSON должна быть "внутренняя" ошибка
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: "INTERNAL",
      message: expect.any(String), //обычно "Внутренняя ошибка сервера"
    }),
  );
  spy.mockRestore();
});

test("sendError -> если AppError без details, json уходит без details", () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  const err = AppError.invalidWebhookSignature();

  sendError(res, err);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({
    error: "INVALID_WEBHOOK_SIGNATURE",
    group: "AUTH",
    message: err.message,
    details: undefined,
  });
});
