// Подключаем функцию, которую тестируем
import { requireFields } from "../core/requestValidation";

//Подключаем AppError, чтобы сравнивать ошибки
import { AppError } from "../core/errors";

test("requireFields -> кидает ошибку, если поля отсуствуют/пустые", () => {
  // 1) Делаем объект "как будто пришел запрос"
  const data: any = {
    a: 1, //есть
    b: "", //пустая строка = считается отсутствующим
    c: null, // null = считается отсутсвующим
    // d вообще нет
  };

  // 2) Функция должна выбросить AppError.validationMissingFields(...)
  expect(() => {
    //location = "body" (мы говорили: данные из body запроса)
    requireFields("body", data, ["a", "b", "c", "d"]);
  }).toThrow(AppError.validationMissingFields("body", ["b", "c", "d"]));
});

test("requireFields -> Не кидает ошибку, если всё заполнено", () => {
  // 1) Все поля заполнены
  const data: any = {
    a: 1,
    b: "ok",
    c: 1,
    d: true,
  };

  // 2) Ошибки быть не должно
  expect(() => {
    requireFields("body", data, ["a", "b", "c", "d"]);
  }).not.toThrow();
});

test("requireFields -> СЧИТАЕТ 0 и false 'пустыми' (зафиксировано текущим правилом)", () => {
  // Это “документирующий” тест: он показывает неинтуитивное правило,
  // чтобы потом никто случайно не решил, что это баг тестов.
  const data: any = {
    a: 1,
    b: "ok",
    c: 0, // из-за == "" считается “пустым”
    d: false, // из-за == "" считается “пустым”
  };

  expect(() => {
    requireFields("body", data, ["a", "b", "c", "d"]);
  }).toThrow(AppError.validationMissingFields("body", ["c", "d"]));
});
