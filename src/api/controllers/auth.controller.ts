import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../../config/env.ts";
import { GoogleAuthError, verifyGoogleCredential } from "../../auth/google.ts";
import { findOrCreateGoogleUser } from "../services/auth/google.service.ts";
import User from "../../db/models/User.ts";
import {
  ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  createAccessToken,
  type AuthUser,
} from "../../auth/accessToken.ts";

const signupSchema = z
  .object({
    username: z
      .string({ error: "Ingresa un nombre de usuario." })
      .trim()
      .min(3, { error: "El nombre de usuario debe tener al menos 3 caracteres." })
      .max(30, { error: "El nombre de usuario puede tener hasta 30 caracteres." })
      .regex(/^[a-zA-Z0-9_]+$/, {
        error: "El nombre de usuario solo puede usar letras, números y guion bajo, sin espacios.",
      }),
    email: z
      .string({ error: "Ingresa tu correo electrónico." })
      .trim()
      .email({ error: "Ingresa un correo electrónico válido." })
      .transform((value) => value.toLowerCase()),
    password: z
      .string({ error: "Ingresa una contraseña." })
      .min(8, { error: "La contraseña debe tener al menos 8 caracteres." })
      .max(72, { error: "La contraseña puede tener hasta 72 caracteres." }),
    confirmPassword: z.string({ error: "Confirma tu contraseña." }),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z
    .string({ error: "Ingresa tu correo electrónico." })
    .trim()
    .email({ error: "Ingresa un correo electrónico válido." })
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ error: "Ingresa tu contraseña." })
    .min(1, { error: "Ingresa tu contraseña." })
    .max(72, { error: "La contraseña puede tener hasta 72 caracteres." }),
});

function validationErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}

function toAuthUser(user: { get(attribute: string): unknown }): AuthUser {
  return {
    id: user.get("id") as string,
    username: user.get("username") as string,
    email: user.get("email") as string,
    gamesPlayed: user.get("games_played") as number,
    gamesWon: user.get("games_won") as number,
    timesImpostor: user.get("times_impostor") as number,
    timesEliminated: user.get("times_eliminated") as number,
  };
}

function authResponse(user: AuthUser) {
  return {
    user: { ...user, isGuest: false },
    token: createAccessToken(user),
    tokenType: "Bearer" as const,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  };
}

const googleSchema = z.object({ credential: z.string().trim().min(1).max(16_384) });

export async function googleLogin(req: Request, res: Response) {
  // Callback JS + JSON + Bearer: no establece cookies de sesion ni acepta formularios redirect.
  if (!req.is("application/json")) {
    return res.status(415).json({ message: "Envia la credencial como application/json." });
  }
  const origin = req.get("origin");
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    return res.status(403).json({ message: "Origen no permitido." });
  }
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Envia una credencial de Google valida.", errors: validationErrors(parsed.error) });
  }

  try {
    const identity = await verifyGoogleCredential(parsed.data.credential);
    const user = await findOrCreateGoogleUser(identity);
    return res.json(authResponse(toAuthUser(user)));
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    // Errores de Sequelize pueden contener email y SQL: no volcar el objeto.
    console.error("Error interno al iniciar sesion con Google.");
    return res.status(500).json({ message: "No pudimos iniciar sesion. Intenta nuevamente." });
  }
}

export async function signup(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Revisa los campos marcados.",
      errors: validationErrors(parsed.error),
    });
  }

  const { username, email, password } = parsed.data;

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email,
      password_hash: passwordHash,
    });

    return res.status(201).json(authResponse(toAuthUser(user)));
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return res.status(500).json({ message: "No pudimos crear tu cuenta. Intenta nuevamente." });
  }
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Revisa los campos marcados.",
      errors: validationErrors(parsed.error),
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "El correo o la contraseña no son correctos." });
    }

    const passwordHash = user.get("password_hash") as string | null;
    const validPassword = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
    if (!validPassword) {
      return res.status(401).json({ message: "El correo o la contraseña no son correctos." });
    }

    return res.json(authResponse(toAuthUser(user)));
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return res.status(500).json({ message: "No pudimos iniciar sesión. Intenta nuevamente." });
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: "Inicia sesión para continuar." });
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "Tu cuenta ya no está disponible. Inicia sesión nuevamente." });
    }

    return res.json({ user: { ...toAuthUser(user), isGuest: false } });
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return res.status(500).json({ message: "No pudimos cargar tu perfil. Intenta nuevamente." });
  }
}
