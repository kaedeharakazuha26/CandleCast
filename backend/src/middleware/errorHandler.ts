import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AxiosError } from "axios";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.flatten() });
    return;
  }
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 502;
    const detail = err.response?.data ?? err.message;
    res.status(status === 503 ? 503 : status >= 400 && status < 500 ? status : 502).json({
      error: "Upstream failure",
      detail,
    });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error(err);
  res.status(500).json({ error: message });
}
