import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, console, setTimeout: () => 1, clearTimeout() {}, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const config = load("../../config/game.ts");
const machine = load("../../game/stateMachine.ts", { "../config/game.ts": config });
const action = load("../handlers/action.ts");
function fixture() {
  const players = new Map(["host", "guest-a", "guest-b"].map((id, index) => [id, {
    socketId: id, username: id, isHost: index === 0, isOnline: true, isLobbyReady: false, isGuest: index !== 0,
  }]));
  const room = { id: "room", hostId: "host", players, settings: { impostorCount: 1 }, status: "waiting" };
  const events = [];
  const io = { to: () => ({ emit: (name, data) => events.push({ name, data }) }) };
  let starts = 0;
  const handlers = load("../handlers/room.handlers.ts", {
    "./action.ts": action,
    "../../game/stateMachine.ts": machine,
    "../services/room.service.ts": { getRoom: (id) => id === room.id ? room : undefined, renewRoomInactivity() {}, clearRoomInactivity() {}, getPublicRoom: (room) => ({ ...room, players: [...room.players.values()].map((p) => ({ ...p })) }) },
    "../services/game.service.ts": { startCharacterPhase: () => starts++ },
    "../../auth/accessToken.ts": {}, "../../db/models/User.ts": {}, "../../config/game.ts": config,
    "../services/session.service.ts": { getPlayerId: (socket) => socket.data.playerId },
  });
  const act = (playerId, event, payload = { roomId: "room" }) => {
    const callbacks = new Map();
    const socket = { id: `transport-${playerId}`, data: { playerId }, on: (event, fn) => callbacks.set(event, fn) };
    handlers.registerRoomHandlers(io, socket);
    let response;
    callbacks.get(event)(payload, (value) => { response = value; });
    return response;
  };
  return { room, players, events, act, starts: () => starts };
}
test("only the host starts, and everyone including the host must confirm readiness", () => {
  const f = fixture();
  assert.equal(f.act("guest-a", "startGame").code, "NOT_HOST");
  assert.equal(f.act("host", "startGame").code, "NOT_ALL_READY");
  assert.equal(f.starts(), 0);
  for (const id of ["guest-a", "guest-b"]) assert.equal(f.act(id, "lobbyReady").success, true);
  assert.equal(f.act("host", "startGame").code, "NOT_ALL_READY");
  assert.equal(f.act("host", "lobbyReady").success, true);
  assert.equal(f.act("host", "startGame").success, true);
  assert.equal(f.starts(), 1);
  assert.equal(f.room.status, "playing");
  assert.equal(f.events.filter((e) => e.name === "gameStarted").length, 1);
  assert.equal(f.act("host", "startGame").success, false);
});
test("guests can ready up, updates are broadcast, and repeated confirmation is idempotent", () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) assert.equal(f.act("guest-a", "lobbyReady").success, true);
  assert.equal(f.players.get("guest-a").isLobbyReady, true);
  assert.equal(f.players.get("guest-b").isLobbyReady, false);
  assert.equal(f.events.at(-1).name, "roomUpdated");
  assert.equal(f.events.at(-1).data.players.find((p) => p.socketId === "guest-a").isLobbyReady, true);
});
test("readiness rejects outsiders, offline players, wrong rooms, invalid payloads and running games", () => {
  const f = fixture();
  assert.equal(f.act("outsider", "lobbyReady").code, "NOT_IN_ROOM");
  assert.equal(f.act("host", "lobbyReady", { roomId: "missing" }).code, "ROOM_NOT_FOUND");
  assert.equal(f.act("host", "lobbyReady", {}).code, "INVALID_PAYLOAD");
  f.players.get("guest-a").isOnline = false;
  assert.equal(f.act("guest-a", "lobbyReady").code, "NOT_IN_ROOM");
  f.room.status = "playing";
  assert.equal(f.act("host", "lobbyReady").code, "ROOM_NOT_WAITING");
  assert.equal(f.events.length, 0);
});
test("new arrivals and disconnections block start even if everyone else is ready", () => {
  const f = fixture();
  for (const id of f.players.keys()) f.act(id, "lobbyReady");
  f.players.set("new-guest", { socketId: "new-guest", isOnline: true, isLobbyReady: false });
  assert.equal(f.act("host", "startGame").code, "NOT_ALL_READY");
  f.act("new-guest", "lobbyReady");
  f.players.get("guest-b").isOnline = false;
  assert.equal(f.act("host", "startGame").code, "NOT_ALL_READY");
  assert.equal(f.starts(), 0);
  f.players.delete("guest-b");
  assert.equal(f.act("host", "startGame").success, true);
});
test("readiness does not bypass minimum players or impostor limits", () => {
  const f = fixture();
  for (const id of f.players.keys()) f.act(id, "lobbyReady");
  f.room.settings.impostorCount = 3;
  assert.equal(f.act("host", "startGame").code, "MIN_PLAYERS");
  f.room.settings.impostorCount = 1;
  f.players.delete("guest-b");
  assert.equal(f.act("host", "startGame").code, "MIN_PLAYERS");
});
test("public snapshots preserve lobby readiness without exposing roles or private credentials", () => {
  const service = load("../services/room.service.ts", { uuid: { v4: () => "snapshot-room" }, "../../config/game.ts": config });
  const room = service.createRoom("host", "Anfitrión", { maxPlayers: 8, password: "private" }, "", "user", false, "Test");
  try {
    const player = room.players.get("host");
    assert.equal(player.isLobbyReady, false);
    player.isLobbyReady = true;
    player.resumeTokenHash = "private-credential";
    player.isImpostor = true;
    player.characterId = "secret";
    const dto = service.getPublicRoom(room);
    assert.equal(dto.players[0].isLobbyReady, true);
    for (const field of ["resumeTokenHash", "isImpostor", "characterId"]) assert.equal(field in dto.players[0], false);
    assert.equal("password" in dto.settings, false);
    const sessions = load("../services/session.service.ts", { "node:crypto": {}, "./room.service.ts": service });
    const snapshot = sessions.getGameSnapshot(room, "host");
    assert.equal(snapshot.room.players[0].isLobbyReady, true);
  } finally { service.deleteRoom(room.id); }
});
test("disconnect clears lobby readiness; reconnect does not silently mark the player ready", () => {
  const f = fixture();
  const game = load("../services/game.service.ts", {
    "../../game/stateMachine.ts": machine, "../../game/winConditions.ts": {},
    "../../api/services/character/character.service.ts": {}, "./room.service.ts": { getPublicRoom: () => ({}) },
    "../../config/game.ts": config, uuid: {},
    "../../db/models/GameHistory.ts": {}, "../../db/models/GamePlayer.ts": {}, "../../db/models/User.ts": {},
  });
  const player = f.players.get("guest-a");
  player.isLobbyReady = true;
  const io = { to: () => ({ emit() {} }) };
  game.handlePlayerDisconnect(io, f.room, "guest-a");
  assert.equal(player.isOnline, false);
  assert.equal(player.isLobbyReady, false);
  game.handlePlayerReconnect(io, f.room, "guest-a");
  assert.equal(player.isOnline, true);
  assert.equal(player.isLobbyReady, false);
});
