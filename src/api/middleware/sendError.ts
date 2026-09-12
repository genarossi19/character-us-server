import type { Response } from "express";

export function sendError(res: Response, status: number, message: string, error?: unknown) {
  if (error) console.error(message, error);
  return res.status(status).json({ message });
}
