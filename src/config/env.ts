import dotenv from "dotenv";
dotenv.config();

const required = [
  "DB_CONNECTION_STRING",
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_HASH",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Variable de entorno requerida no definida: ${key}`);
  }
}

export const env = {
  DB_CONNECTION_STRING: process.env.DB_CONNECTION_STRING!,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_ISSUER: process.env.JWT_ISSUER || "character-us-server",
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || "character-us-client",
  COOKIE_SECRET:
    process.env.COOKIE_SECRET || "dev-only-secret-change-in-production",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL!,
  ADMIN_HASH: process.env.ADMIN_HASH!,
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
} as const;
