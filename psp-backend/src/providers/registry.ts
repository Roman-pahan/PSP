import { PaymentProvider } from "./types";
import { mockBankProvider } from "./mockBankProvider";
import { fakeBankProvider } from "./fakeBankProvider"; // ДОБАВИЛИ второго фейкового провайдера.

//Это пока очень простой реестр провайдеров
// Позже тут будет несколько провайдеров

const providers: Record<string, PaymentProvider> = {
  [mockBankProvider.code]: mockBankProvider,
  [fakeBankProvider.code]: fakeBankProvider, // Регистрируем fake_bank.
};

//Функция для получания провайдера по коду
export function getProviderByCode(code?: string | null): PaymentProvider {
  //Если код не передан - пока считаем, что это mock_bank
  const normalizedCode = code || "mock_bank";

  //Ищем провайдера в реестре.
  const provider = providers[normalizedCode];

  //Если не нашли - кидаем ошибку
  if (!provider) {
    throw new Error(`Провайдер "${normalizedCode} не зарегистрирован`);
  }

  //Возвращаем найденного провайдера
  return provider;
}
//Функция для получения провайдера по умолчанию.
export function getDefaultProvider(): PaymentProvider {
  return mockBankProvider;
}
