import express from "express";
import request from "supertest";
import { applySecurityHeaders } from "../core/securityHeaders";

test("security headers middleware -> sets core headers", async () => {
  const app = express();
  app.use(applySecurityHeaders);
  app.get("/probe", (_req, res) => {
    res.json({ ok: true });
  });

  const res = await request(app).get("/probe").expect(200);

  expect(res.headers["x-content-type-options"]).toBe("nosniff");
  expect(res.headers["x-frame-options"]).toBe("DENY");
  expect(res.headers["referrer-policy"]).toBe("no-referrer");
  expect(res.headers["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
});
