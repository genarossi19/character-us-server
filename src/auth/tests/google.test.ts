import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import bcrypt from "bcryptjs";
import { LoginTicket, OAuth2Client, type TokenPayload } from "google-auth-library";
import { UniqueConstraintError } from "sequelize";

// Configuracion aislada: las consultas y la verificacion Google se reemplazan por mocks.
Object.assign(process.env, {
  DB_CONNECTION_STRING: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "isolated-google-auth-test-secret-at-least-32-characters",
  ADMIN_EMAIL: "admin@example.com", ADMIN_HASH: "unused-in-tests",
  GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  CORS_ORIGIN: "http://localhost:5173",
});

const { default: authRoutes } = await import("../../api/routes/auth.routes.ts");
const { default: User } = await import("../../db/models/User.ts");
const { verifyAccessToken } = await import("../accessToken.ts");
const { env } = await import("../../config/env.ts");

const identity: TokenPayload = {
  sub: "google-user-123", email: "Player@gmail.com", email_verified: true,
  name: "Nombre de Google", aud: env.GOOGLE_CLIENT_ID,
  iss: "https://accounts.google.com", iat: 100, exp: 200,
};

test("login Google y compatibilidad con sesiones existentes", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  const post = (body: unknown = { credential: "google-id-token" }, headers = {}) => fetch(`${base}/google`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  const account = () => User.build({
    id: "9da168c6-35ce-4bc0-9cf7-c8c9204bc4b9", username: identity.name!,
    email: "player@gmail.com", google_sub: identity.sub,
    password_hash: null,
  });

  await t.test("rechaza campos invalidos antes de consultar Google o BD", async (s) => {
    const verify = s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => { throw new Error("No invocar"); });
    const find = s.mock.method(User, "findOne", async () => { throw new Error("No consultar BD"); });
    for (const body of [{}, [], { credential: "" }, { credential: 123 }, { credential: "x".repeat(16385) }]) {
      assert.equal((await post(body)).status, 400);
    }
    assert.equal(verify.mock.callCount(), 0);
    assert.equal(find.mock.callCount(), 0);
  });

  await t.test("rechaza formularios y origen ajeno", async () => {
    assert.equal((await post(undefined, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post(undefined, { Origin: "https://otro.example" })).status, 403);
  });

  await t.test("Google sin configurar responde 503", async () => {
    const original = env.GOOGLE_CLIENT_ID;
    Object.assign(env, { GOOGLE_CLIENT_ID: "" });
    try { assert.equal((await post()).status, 503); }
    finally { Object.assign(env, { GOOGLE_CLIENT_ID: original }); }
  });

  await t.test("firma/audiencia/vencimiento rechazados por Google no acceden a BD", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => { throw new Error("invalid signature/audience/expiry"); });
    const find = s.mock.method(User, "findOne", async () => { throw new Error("No consultar BD"); });
    assert.equal((await post()).status, 401);
    assert.equal(find.mock.callCount(), 0);
  });

  await t.test("email no verificado o identidad incompleta devuelve 401", async (s) => {
    const find = s.mock.method(User, "findOne", async () => { throw new Error("No consultar BD"); });
    for (const payload of [{ ...identity, email_verified: false }, { ...identity, sub: "" }, { ...identity, email: "" }, { ...identity, name: "" }]) {
      const verify = s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", payload));
      assert.equal((await post()).status, 401);
      verify.mock.restore();
    }
    assert.equal(find.mock.callCount(), 0);
  });

  await t.test("primer acceso guarda solo identidad verificada y emite JWT para /me", async (s) => {
    const verify = s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    s.mock.method(User, "findOne", async () => null);
    let created: Record<string, unknown> = {};
    s.mock.method(User, "create", async (values: Record<string, unknown>) => {
      created = values;
      return User.build({ ...values, id: account().get("id") } as never);
    });
    const response = await post({ credential: "google-id-token", name: "Falso", email: "falso@example.com" }, { Origin: "http://localhost:5173" });
    assert.equal(response.status, 200);
    assert.deepEqual(verify.mock.calls[0]!.arguments, [{ idToken: "google-id-token", audience: env.GOOGLE_CLIENT_ID }]);
    assert.equal(created.email, "player@gmail.com");
    assert.equal(created.google_sub, identity.sub);
    assert.equal(created.password_hash, null);
    assert.equal(created.username, identity.name);
    const result = await response.json();
    assert.equal(result.tokenType, "Bearer");
    assert.equal(result.expiresIn, 3600);
    assert.equal(result.user.isGuest, false);
    assert.equal(result.user.password_hash, undefined);
    assert.equal(result.user.google_sub, undefined);
    assert.equal(verifyAccessToken(result.token)?.id, result.user.id);
    s.mock.method(User, "findByPk", async () => account());
    const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${result.token}` } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.username, identity.name);
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: "Bearer google-id-token" } })).status, 403);
  });

  await t.test("accesos siguientes conservan cuenta y estadisticas buscando por sub", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", { ...identity, email: "nuevo@gmail.com" }));
    const user = account();
    user.set("games_won", 5);
    const find = s.mock.method(User, "findOne", async () => user);
    const create = s.mock.method(User, "create", async () => { throw new Error("No crear"); });
    const result = await (await post()).json();
    assert.equal(result.user.id, user.get("id"));
    assert.equal(result.user.gamesWon, 5);
    assert.deepEqual(find.mock.calls[0]!.arguments, [{ where: { google_sub: identity.sub } }]);
    assert.equal(create.mock.callCount(), 0);
  });

  await t.test("email existente no vincula cuentas ni emite token", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    let calls = 0;
    s.mock.method(User, "findOne", async () => ++calls === 1 ? null : account());
    const create = s.mock.method(User, "create", async () => { throw new Error("No crear"); });
    const response = await post();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).token, undefined);
    assert.equal(create.mock.callCount(), 0);
  });

  await t.test("dos identidades Google pueden tener el mismo nombre visible", async (s) => {
    const anotherIdentity = { ...identity, sub: "google-user-456", email: "other@gmail.com" };
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", anotherIdentity));
    s.mock.method(User, "findOne", async () => null);
    let created: Record<string, unknown> = {};
    s.mock.method(User, "create", async (values: Record<string, unknown>) => {
      created = values;
      return User.build({ ...values, id: account().get("id") } as never);
    });
    assert.equal((await post()).status, 200);
    assert.equal(created.username, identity.name);
    assert.equal(created.google_sub, anotherIdentity.sub);
  });

  await t.test("callbacks simultaneos recuperan cuenta tras restriccion unica", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    let calls = 0;
    s.mock.method(User, "findOne", async () => ++calls <= 2 ? null : account());
    s.mock.method(User, "create", async () => { throw new UniqueConstraintError({}); });
    assert.equal((await post()).status, 200);
  });

  await t.test("repara una cuenta Google anterior que usaba un username tecnico", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    const legacy = User.build({
      id: "9da168c6-35ce-4bc0-9cf7-c8c9204bc4b9", username: "google_c23b4a22bb5bf29c3ad8",
      email: "player@gmail.com", google_sub: null, password_hash: null,
    });
    s.mock.method(legacy, "update", async (values: Record<string, unknown>) => {
      legacy.set(values);
      return legacy;
    });
    let calls = 0;
    s.mock.method(User, "findOne", async () => ++calls === 1 ? null : legacy);
    const result = await (await post()).json();
    assert.equal(result.user.username, identity.name);
    assert.equal(legacy.get("google_sub"), identity.sub);
  });

  await t.test("conflicto concurrente con otra cuenta devuelve 409", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    s.mock.method(User, "findOne", async () => null);
    s.mock.method(User, "create", async () => { throw new UniqueConstraintError({}); });
    const response = await post();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).token, undefined);
  });

  await t.test("errores de BD no devuelven datos internos ni tokens", async (s) => {
    s.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => new LoginTicket("", identity));
    s.mock.method(User, "findOne", async () => { throw new Error("private-database-details"); });
    const log = s.mock.method(console, "error", () => {});
    const response = await post();
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.ok(!body.includes("private-database-details"));
    assert.equal(JSON.parse(body).token, undefined);
    assert.equal(log.mock.callCount(), 1);
  });

  await t.test("login con contraseña existente sigue funcionando", async (s) => {
    const user = account();
    user.set("google_sub", null);
    user.set("password_hash", await bcrypt.hash("valid-password", 4));
    s.mock.method(User, "findOne", async () => user);
    const response = await fetch(`${base}/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "player@gmail.com", password: "valid-password" }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.user.username, identity.name);
    assert.equal(verifyAccessToken(result.token)?.id, user.get("id"));
  });

  await t.test("cuenta Google sin contraseña rechaza login local con 401", async (s) => {
    s.mock.method(User, "findOne", async () => account());
    const response = await fetch(`${base}/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "player@gmail.com", password: "any-password" }),
    });
    assert.equal(response.status, 401);
  });
});
