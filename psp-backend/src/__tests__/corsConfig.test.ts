import { createCorsOriginChecker, parseAllowedOrigins } from "../core/corsConfig";

test("parseAllowedOrigins -> falls back to localhost vite origin", () => {
  expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:5173"]);
});

test("parseAllowedOrigins -> parses comma separated origins", () => {
  expect(
    parseAllowedOrigins("http://localhost:5173, https://admin.psp.local"),
  ).toEqual(["http://localhost:5173", "https://admin.psp.local"]);
});

test("createCorsOriginChecker -> allows configured origin", async () => {
  const checker = createCorsOriginChecker(["http://localhost:5173"]);

  await expect(
    new Promise<boolean>((resolve, reject) => {
      checker("http://localhost:5173", (err, allow) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(Boolean(allow));
      });
    }),
  ).resolves.toBe(true);
});

test("createCorsOriginChecker -> rejects unknown origin", async () => {
  const checker = createCorsOriginChecker(["http://localhost:5173"]);

  await expect(
    new Promise<boolean>((resolve, reject) => {
      checker("https://evil.example", (err, allow) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(Boolean(allow));
      });
    }),
  ).rejects.toThrow("CORS origin is not allowed");
});
