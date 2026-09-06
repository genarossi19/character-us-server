import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.ts";

export interface AuthPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token de acceso requerido" });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido o expirado" });
  }
}

export function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token de acceso requerido" });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (decoded.email !== env.ADMIN_EMAIL) {
      return res.status(403).json({ message: "Acceso denegado: no es admin" });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido o expirado" });
  }
}
