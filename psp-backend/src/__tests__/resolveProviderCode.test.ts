import { resolveProviderCode } from "../providers/resolveProviderCode";

describe("resolveProviderCode", () => {
  test("если providerCode передан руками как mock_bank, вернуть mock_bank", () => {
    //Вызываем функцию с ручным указанием провайдера.
    const result = resolveProviderCode(5000, "mock_bank");

    //Проверяем, что ручной выбор сильнее автоправила.
    expect(result).toBe("mock_bank");
  });

  test("если providerCode передан руками как fake_bank, вернуть fake_bank", () => {
    // Вызываем функцию с ручным указанием провайдера.
    const result = resolveProviderCode(1000, "fake_bank");

    // Проверяем, что ручной выбор сильнее автоправила.
    expect(result).toBe("fake_bank");
  });

  test("если сумма меньше 2000, вернуть mock_bank", () => {
    // Вызываем функцию без ручного providerCode.
    const result = resolveProviderCode(1500);

    // Проверяем автоправило для маленькой суммы.
    expect(result).toBe("mock_bank");
  });

  test("если сумма равна 2000, вернуть fake_bank", () => {
    // Вызываем функцию без ручного providerCode.
    const result = resolveProviderCode(2000);

    // Проверяем граничное значение.
    expect(result).toBe("fake_bank");
  });

  test("если сумма больше 2000, вернуть fake_bank", () => {
    // Вызываем функцию без ручного providerCode.
    const result = resolveProviderCode(3500);

    // Проверяем автоправило для большей суммы.
    expect(result).toBe("fake_bank");
  });
});
