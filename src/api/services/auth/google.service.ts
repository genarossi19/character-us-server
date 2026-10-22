import { UniqueConstraintError } from "sequelize";
import User from "../../../db/models/User.ts";
import { GoogleAuthError, type GoogleIdentity } from "../../../auth/google.ts";

export async function findOrCreateGoogleUser(identity: GoogleIdentity) {
  // La identidad estable es sub, no el email (que puede cambiar).
  const existing = await User.findOne({ where: { google_sub: identity.sub } });
  if (existing) {
    if (isLegacyGoogleUsername(existing.get("username")) && existing.get("username") !== identity.username) {
      await existing.update({ username: identity.username });
    }
    return existing;
  }

  const emailOwner = await User.findOne({ where: { email: identity.email } });
  if (emailOwner) {
    if (
      emailOwner.get("password_hash") === null &&
      emailOwner.get("google_sub") === null &&
      isLegacyGoogleUsername(emailOwner.get("username"))
    ) {
      await emailOwner.update({ google_sub: identity.sub, username: identity.username });
      return emailOwner;
    }
    throw new GoogleAuthError(409, "Este email ya tiene una cuenta. Inicia sesion con tu metodo habitual.");
  }

  try {
    return await User.create({
      google_sub: identity.sub,
      email: identity.email,
      // El username es el nombre publico del jugador; no necesita ser unico.
      username: identity.username,
      password_hash: null,
    });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    // Dos callbacks simultaneos deben resolver la misma cuenta, sin duplicarla.
    const concurrent = await User.findOne({ where: { google_sub: identity.sub } });
    if (concurrent) return concurrent;
    throw new GoogleAuthError(409, "El email ya esta registrado. Intenta nuevamente.");
  }
}

function isLegacyGoogleUsername(value: unknown): value is string {
  return typeof value === "string" && /^google_[a-f0-9]{20}$/i.test(value);
}
