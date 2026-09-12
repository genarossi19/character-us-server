import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AuthUser } from "../../auth/accessToken.ts";
import { env } from "../../config/env.ts";

export type AuthPayload = AuthUser;

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

function getBearerToken(req: Request): string | null {
  const [scheme, token] = req.headers.authorization?.split(" ") || [];
  return scheme === "Bearer" && token ? token : null;
}

function getAuthenticatedUser(req: Request, res: Response): AuthPayload | null {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Inicia sesión para continuar." });
    return null;
  }

  const user = verifyAccessToken(token);
  if (!user) {
    res.status(403).json({ message: "Tu sesión venció o no es válida. Inicia sesión nuevamente." });
    return null;
  }

  return user;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  req.user = user;
  next();
}

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getAuthenticatedUser(req, res);
  if (!user) return;

  if (user.email !== env.ADMIN_EMAIL) {
    return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
  }

  req.user = user;
  next();
}
