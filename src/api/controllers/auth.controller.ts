import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import User from "../../db/models/User.ts";
import { env } from "../../config/env.ts";

const signupSchema = z.object({
  username: z.string().min(1).max(30),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: "7d" });
}

export async function signup(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Datos inválidos",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { username, email, password } = parsed.data;

  try {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ message: "El username ya está en uso" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      email,
      password: passwordHash,
    });

    const token = generateToken(user.get("id") as string, email);

    res.status(201).json({
      user: {
        id: user.get("id"),
        username: user.get("username"),
        email: user.get("email"),
        avatar_url: user.get("avatar_url"),
        isGuest: false,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear usuario" });
  }
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: "Datos inválidos",
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.get("password") as string
    );
    if (!validPassword) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = generateToken(user.get("id") as string, email);

    res.json({
      user: {
        id: user.get("id"),
        username: user.get("username"),
        email: user.get("email"),
        avatar_url: user.get("avatar_url"),
        isGuest: false,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al iniciar sesión" });
  }
}
