import { maskPanForError } from "../core/requestValidation";

test("maskPanForError -> маскирует все цифры как X", () => {
  const input = "4111 1111 1111 1111";
  const result = maskPanForError(input);

  //В номере 16 цифр -> должно быть 16 X

  expect(result).toBe("XXXX XXXX XXXX XXXX");
});

test("maskPanForError -> маскирует все цифры как X", () => {
  const input = "378282246310005";
  const result = maskPanForError(input);

  //В номере 16 цифр -> должно быть 16 X

  expect(result).toBe("XXXX XXXX XXXX XXX");
});

test("maskPanForError -> если raw = null, возвращает NO_DIGITS", () => {
  expect(maskPanForError(null)).toBe("NO_DIGITS");
});

test("maskPanForError -> если в строке нет цифр, врзвращает NO_DIGITS", () => {
  expect(maskPanForError("abcd")).toBe("NO_DIGITS");
});
