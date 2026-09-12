import sequelize from "../sequelize.ts";
import { QueryTypes } from "sequelize";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import User from "../models/User.ts";
import Category from "../models/Category.ts";
import Character from "../models/Character.ts";
import GameHistory from "../models/GameHistory.ts";
import GamePlayer from "../models/GamePlayer.ts";

const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const shouldStartLocalServer = !process.env.API_BASE_URL;
const serverEntrypoint = fileURLToPath(new URL("../../index.ts", import.meta.url));
const tsNodeEntrypoint = fileURLToPath(
  new URL("../../../node_modules/.bin/ts-node", import.meta.url)
);

let localServer: ChildProcess | null = null;

type Sample = { get(options: { plain: true }): Record<string, unknown> } | null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verifyModel(
  table: string,
  getSample: () => Promise<Sample>,
  requiredFields: string[]
): Promise<void> {
  const sample = await getSample();

  if (!sample) {
    console.log(`[OK] ${table}: tabla accesible (sin registros para serializar)`);
    return;
  }

  const serialized = sample.get({ plain: true });
  const missingFields = requiredFields.filter((field) => !(field in serialized));
  assert(
    missingFields.length === 0,
    `${table}: serializacion incompleta; faltan ${missingFields.join(", ")}`
  );

  console.log(`[OK] ${table}: consulta y serializacion Sequelize correctas`);
}

async function fetchJson(
  path: string,
  options?: RequestInit
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isApiAvailable(): Promise<boolean> {
  try {
    await fetch(`${apiBaseUrl}/api/category`);
    return true;
  } catch {
    return false;
  }
}

async function ensureApiServer(): Promise<void> {
  if (await isApiAvailable()) return;

  if (!shouldStartLocalServer) {
    throw new Error(`No se pudo conectar con API_BASE_URL=${apiBaseUrl}`);
  }

  let startupOutput = "";
  localServer = spawn(tsNodeEntrypoint, [serverEntrypoint], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const captureOutput = (chunk: Buffer) => {
    startupOutput = `${startupOutput}${chunk.toString()}`.slice(-4_000);
  };
  localServer.stdout?.on("data", captureOutput);
  localServer.stderr?.on("data", captureOutput);

  for (let attempt = 0; attempt < 40; attempt++) {
    if (await isApiAvailable()) {
      console.log("[OK] Servidor HTTP local iniciado para verificar endpoints");
      return;
    }

    if (localServer.exitCode !== null) {
      throw new Error(`El servidor local termino durante el inicio:\n${startupOutput}`);
    }

    await delay(250);
  }

  throw new Error(`El servidor local no respondio en 10 segundos:\n${startupOutput}`);
}

async function stopLocalServer(): Promise<void> {
  if (!localServer || localServer.exitCode !== null) return;

  localServer.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    localServer?.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function verifyEndpoints(): Promise<void> {
  const openApi = await fetchJson("/openapi.json");
  assert(openApi.status === 200, `GET /openapi.json devolvio ${openApi.status}`);
  assert(isRecord(openApi.body) && openApi.body.openapi === "3.1.0", "GET /openapi.json no devolvio OpenAPI 3.1");
  console.log("[OK] GET /openapi.json");

  const docs = await fetch(`${apiBaseUrl}/docs`);
  assert(docs.status === 200, `GET /docs devolvio ${docs.status}`);
  assert(docs.headers.get("content-type")?.includes("text/html"), "GET /docs no devolvio HTML");
  console.log("[OK] GET /docs");

  const socketDocs = await fetch(`${apiBaseUrl}/docs/socket`);
  assert(socketDocs.status === 200, `GET /docs/socket devolvio ${socketDocs.status}`);
  assert(socketDocs.headers.get("content-type")?.includes("text/markdown"), "GET /docs/socket no devolvio Markdown");
  console.log("[OK] GET /docs/socket");

  const categories = await fetchJson("/api/category");
  assert(categories.status === 200, `GET /api/category devolvio ${categories.status}`);
  assert(Array.isArray(categories.body), "GET /api/category no devolvio un array");
  console.log("[OK] GET /api/category");

  const characters = await fetchJson("/api/character");
  assert(characters.status === 200, `GET /api/character devolvio ${characters.status}`);
  assert(Array.isArray(characters.body), "GET /api/character no devolvio un array");
  if (characters.body.length > 0) {
    const [character] = characters.body as Record<string, unknown>[];
    assert("imageUrl" in character, "GET /api/character no serializa imageUrl");
    assert(!("image" in character), "GET /api/character expone la columna interna image");
  }
  console.log("[OK] GET /api/character");

  const leaderboard = await fetchJson("/api/stats/leaderboard?limit=1");
  assert(
    leaderboard.status === 200,
    `GET /api/stats/leaderboard devolvio ${leaderboard.status}`
  );
  assert(Array.isArray(leaderboard.body), "GET /api/stats/leaderboard no devolvio un array");
  console.log("[OK] GET /api/stats/leaderboard");

  const login = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `verification-${crypto.randomUUID()}@example.invalid`,
      password: "verification-only",
    }),
  });
  assert(login.status === 401, `POST /api/auth/login devolvio ${login.status}`);
  console.log("[OK] POST /api/auth/login consulta users sin crear datos");

  const invalidSignup = await fetchJson("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "nombre con espacios",
      email: "player@example.com",
      password: "VerificationPass123",
      confirmPassword: "VerificationPass123",
    }),
  });
  assert(invalidSignup.status === 400, `POST /api/auth/signup invalido devolvio ${invalidSignup.status}`);
  assert(isRecord(invalidSignup.body) && isRecord(invalidSignup.body.errors), "POST /api/auth/signup invalido no devolvio errores por campo");
  const usernameErrors = invalidSignup.body.errors.username;
  assert(
    Array.isArray(usernameErrors) && usernameErrors.includes("El nombre de usuario solo puede usar letras, números y guion bajo, sin espacios."),
    "POST /api/auth/signup invalido no devolvio un mensaje claro para username"
  );
  assert(
    !JSON.stringify(invalidSignup.body).includes("Invalid string"),
    "POST /api/auth/signup invalido expone el mensaje interno de Zod"
  );
  console.log("[OK] Errores de validación en español y sin detalles técnicos");
}

async function verifyGameWinnerEnum(): Promise<void> {
  const values = await sequelize.query<{ value: string }>(
    `SELECT enumlabel AS value
     FROM pg_enum
     JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
     WHERE pg_type.typname = 'game_winner'
     ORDER BY enumsortorder`,
    { type: QueryTypes.SELECT }
  );
  const winners = values.map(({ value }) => value);
  assert(
    winners.length === 2 && winners.includes("innocent") && winners.includes("impostor"),
    `game_winner debe contener solo innocent e impostor; valores actuales: ${winners.join(", ") || "ninguno"}`
  );
  console.log("[OK] Enum game_winner: innocent, impostor");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function verifyAuthFlow(): Promise<void> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const username = `verify_${suffix}`;
  const email = `${username}@example.invalid`;
  const password = "VerificationPass123";
  let userId: string | null = null;

  try {
    const signup = await fetchJson("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, confirmPassword: password }),
    });
    assert(signup.status === 201, `POST /api/auth/signup devolvio ${signup.status}`);
    assert(isRecord(signup.body), "POST /api/auth/signup no devolvio un objeto");
    assert(typeof signup.body.token === "string", "POST /api/auth/signup no devolvio token");
    assert(isRecord(signup.body.user), "POST /api/auth/signup no devolvio usuario");
    assert(typeof signup.body.user.id === "string", "POST /api/auth/signup no devolvio user.id");
    userId = signup.body.user.id;
    console.log("[OK] POST /api/auth/signup");

    const login = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert(login.status === 200, `POST /api/auth/login devolvio ${login.status}`);
    assert(isRecord(login.body) && typeof login.body.token === "string", "POST /api/auth/login no devolvio token");
    console.log("[OK] POST /api/auth/login");

    const currentUser = await fetchJson("/api/auth/me", {
      headers: { Authorization: `Bearer ${login.body.token}` },
    });
    assert(currentUser.status === 200, `GET /api/auth/me devolvio ${currentUser.status}`);
    assert(isRecord(currentUser.body) && isRecord(currentUser.body.user), "GET /api/auth/me no devolvio usuario");
    assert(currentUser.body.user.id === userId, "GET /api/auth/me devolvio un usuario distinto");
    console.log("[OK] GET /api/auth/me");
  } finally {
    if (userId) {
      await User.destroy({ where: { id: userId } });
      console.log("[OK] Usuario temporal de verificación eliminado");
    }
  }
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log("[OK] Conexion Sequelize con Supabase");

  await verifyModel("users", () => User.findOne(), [
    "id",
    "username",
    "email",
    "password_hash",
    "games_played",
    "games_won",
    "times_impostor",
    "times_eliminated",
    "created_at",
    "updated_at",
  ]);
  await verifyModel("category", () => Category.findOne(), ["id", "name", "description", "status"]);
  await verifyModel("character", () => Character.findOne(), [
    "id",
    "name",
    "description",
    "imageUrl",
    "category_id",
  ]);
  await verifyModel("game_history", () => GameHistory.findOne(), [
    "id",
    "room_id",
    "category",
    "winner",
    "total_rounds",
    "player_count",
    "impostor_count",
    "settings",
    "created_at",
  ]);
  await verifyModel("game_players", () => GamePlayer.findOne(), [
    "id",
    "game_id",
    "user_id",
    "player_name",
    "was_impostor",
    "was_eliminated",
    "survived",
    "eliminated_round",
    "created_at",
  ]);
  await verifyGameWinnerEnum();

  await ensureApiServer();
  await verifyEndpoints();
  if (process.env.AUTH_TEST_WRITE === "true") {
    await verifyAuthFlow();
  }
}

main()
  .then(() => {
    console.log(
      process.env.AUTH_TEST_WRITE === "true"
        ? "Verificacion completada; el usuario temporal fue eliminado."
        : "Verificacion completada sin escrituras."
    );
  })
  .catch((error) => {
    console.error("Verificacion fallida:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopLocalServer();
    await sequelize.close();
  });
