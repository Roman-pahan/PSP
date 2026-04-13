import { ProviderCode } from "./types"; //Тип кода провайдера

//Функция выбирает провайдера
//Если providerCode передали руками - используем его.
//Если нет - выбираем автоматически по сумме.

export function resolveProviderCode(
  amount: number, //Сумма платежа
  providerCode?: ProviderCode, //Необязательный код провайдера из запроса.
): ProviderCode {
  //Если провайдера передали явно - возвращаем его.
  if (providerCode) {
    return providerCode;
  }

  //Если сумма меньше 2000 - используем mock_bank
  if (amount < 2000) {
    return "mock_bank";
  }

  //Если сумма 2000 и больще - используем fake_bank
  return "fake_bank";
}
