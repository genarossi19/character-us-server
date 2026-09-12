import { randomUUID } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.ts";

export const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  gamesPlayed: number;
  gamesWon: number;
  timesImpostor: number;
  timesEliminated: number;
}

interface AccessTokenPayload extends JwtPayload {
  userId: string;
  username: string;
  email: string;
  gamesPlayed: number;
  gamesWon: number;
  timesImpostor: number;
  timesEliminated: number;
  tokenType: "access";
}

export function createAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      email: user.email,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      timesImpostor: user.timesImpostor,
      timesEliminated: user.timesEliminated,
      tokenType: "access",
    },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      audience: env.JWT_AUDIENCE,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      issuer: env.JWT_ISSUER,
      jwtid: randomUUID(),
      subject: user.id,
    }
  );
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      audience: env.JWT_AUDIENCE,
      issuer: env.JWT_ISSUER,
    });

    if (
      typeof decoded === "string" ||
      !isAccessTokenPayload(decoded) ||
      decoded.sub !== decoded.userId
    ) {
      return null;
    }

    return {
      id: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      gamesPlayed: decoded.gamesPlayed,
      gamesWon: decoded.gamesWon,
      timesImpostor: decoded.timesImpostor,
      timesEliminated: decoded.timesEliminated,
    };
  } catch {
    return null;
  }
}

function isAccessTokenPayload(payload: JwtPayload): payload is AccessTokenPayload {
  return (
    payload.tokenType === "access" &&
    typeof payload.userId === "string" &&
    typeof payload.username === "string" &&
    typeof payload.email === "string" &&
    typeof payload.gamesPlayed === "number" &&
    typeof payload.gamesWon === "number" &&
    typeof payload.timesImpostor === "number" &&
    typeof payload.timesEliminated === "number"
  );
}
