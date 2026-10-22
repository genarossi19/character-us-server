import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.ts";

const client = new OAuth2Client();

export class GoogleAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  username: string;
}

// Google valida firma, audiencia, emisor y vencimiento. Nunca confiar en un JWT decodificado.
export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new GoogleAuthError(503, "El inicio de sesion con Google no esta configurado.");
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const username = payload?.name?.trim().slice(0, 100);
    if (!payload?.sub || !payload.email || payload.email_verified !== true || !username) {
      throw new Error("Identidad incompleta, email sin verificar o nombre ausente");
    }
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      username,
    };
  } catch {
    // No registrar credenciales ni errores de Google que puedan contener el token.
    throw new GoogleAuthError(401, "La credencial de Google no es valida o vencio.");
  }
}
