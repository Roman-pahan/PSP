import { Response } from "express";
import { AppError } from "./errors";

export function sendError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    return res.status(err.httpStatus).json({
      error: err.code,
      group: err.group,
      message: err.message,
      details: err.details ?? undefined,
    });
  }

  console.error("Неожиданная ошибка", err);
  return res.status(500).json({
    error: "INTERNAL",
    message: "Внутренняя ошибка сервера",
  });
}
