import { env } from "@/config/env";
import { AppError } from "@/errors/appError";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.length ? issue.path.join(".") : "_root";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return res.status(400).json({
      message: "Invalid request payload",
      errors: fieldErrors,
    });
  }

  if (err instanceof AppError) {
    const body: any = {
      message: err.expose ? err.message : "Internal server error",
    };
    if (err.expose && err.details) body.details = err.details;
    if (!env.IS_PROD && !err.expose && err.stack) body.stack = err.stack;
    return res.status(err.statusCode).json(body);
  }

  const otherError = err as Error;
  const body: any = { message: "Internal server error" };
  if (!env.IS_PROD && otherError?.stack) {
    body.stack = otherError.stack;
    body.error = otherError.message;
  }
  return res.status(500).json(body);
}
