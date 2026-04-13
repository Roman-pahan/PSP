// Импортируем тип PrismaClient (это “класс клиента базы”)
import { PrismaClient } from "@prisma/client"; //класс клиента базы (у класса могут быть методы)
// Берём утилиты для глубокого мока (чтобы prisma.merchant.findMany тоже был мок)
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
//mockDeep() — это функция, которая делает поддельный объект, похожий на Prisma
// Тип: “мокнутый PrismaClient”, чтобы TS подсказывал методы
export type PrismaMock = DeepMockProxy<PrismaClient>;
// “PrismaMock — это PrismaClient, но в виде deep-мока, чтобы TypeScript знал про мок-методы.”
//Функция: создаём мок PrismaClient
export function createPrismaMock(): PrismaMock {
  return mockDeep<PrismaClient>();
}
