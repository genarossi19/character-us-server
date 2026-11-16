import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Server, Socket } from "socket.io";
import { createAccessToken } from "../../auth/accessToken.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import User from "../../db/models/User.ts";
import Character from "../../db/models/Character.ts";
import GameHistory from "../../db/models/GameHistory.ts";
import GamePlayer from "../../db/models/GamePlayer.ts";
import { registerGameHandlers } from "../handlers/game.handlers.ts";
import { registerRoomHandlers } from "../handlers/room.handlers.ts";
import { registerSessionHandlers } from "../handlers/session.handlers.ts";
import { startWordPhase, handlePlayerDisconnect, checkMidGameRemoval } from "../services/game.service.ts";
import { createRoom, joinRoom, deleteRoom, getPublicRoom, getRoom } from "../services/room.service.ts";
import { getGameSnapshot, issueRoomSession } from "../services/session.service.ts";
import type { RoomSettingsInput } from "../../types/Game.ts";

const settings: RoomSettingsInput = {
  category: "9b350ba2-583f-45b1-b3ee-6ae61271f753", impostorCount: 1,
  totalRounds: 1, maxPlayers: 8, privacy: "public", mode: "classic",
  playMode: "in_person", impostorsKnowEachOther: false, visibleVotes: false,
};

function fixture(t: TestContext, overrides: Partial<RoomSettingsInput> = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0.999);
  const room = createRoom("host", "Host", { ...settings, ...overrides }, "", null, false, "Test");
  for (const id of ["a", "b", "c", "d"]) joinRoom(id, room.code, id.toUpperCase(), "", null, true);
  const events: Array<{ target: string; name: string; data: any }> = [];
  const delivery: string[] = [];
  const sockets = new Map<string, Socket>();
  const io = { sockets: { sockets }, to: (target: string) => ({
    emit: (name: string, data: unknown) => { delivery.push(name); events.push({ target, name, data: structuredClone(data) }); },
  }) } as unknown as Server;
  function connect(id: string, playerId?: string) {
    const handlers = new Map<string, Function>();
    const socket = {
      id, data: {} as Record<string, any>, connected: true, rooms: new Set([id]),
      on: (name: string, handler: Function) => handlers.set(name, handler),
      emit: (name: string, data: unknown) => events.push({ target: id, name, data }),
      join: (name: string) => socket.rooms.add(name),
      leave: (name: string) => socket.rooms.delete(name),
      disconnect: () => { socket.connected = false; handlers.get("disconnect")?.(); },
    };
    const typed = socket as unknown as Socket;
    sockets.set(id, typed);
    registerGameHandlers(io, typed);
    registerRoomHandlers(io, typed);
    registerSessionHandlers(io, typed);
    if (playerId) {
      socket.data.playerId = playerId;
      room.players.get(playerId)!.connectionSocketId = id;
    }
    return {
      socket: typed,
      call: async (event: string, payload: unknown, withAck = true) => {
        let ack: any;
        await handlers.get(event)!(payload, withAck ? (value: unknown) => { delivery.push(`ack:${event}`); ack = value; } : undefined);
        return ack;
      },
    };
  }
  const clients = new Map([...room.players.keys()].map((id) => [id, connect(`transport-${id}`, id)]));
  const payload = (round = room.currentRound, turnIndex = room.currentTurnIndex) => ({ roomId: room.id, round, turnIndex });
  async function completeAll() {
    while (room.gamePhase === "word") {
      const id = room.turnOrder[room.currentTurnIndex];
      assert.equal((await clients.get(id)!.call("completeTurn", payload())).success, true);
    }
  }
  t.after(() => { deleteRoom(room.id); t.mock.timers.reset(); });
  room.status = "playing";
  room.currentRound = 1;
  room.players.get("host")!.isImpostor = true;
  room.selectedCharacter = { id: "secret", name: "Secret character", imageUrl: null, category: settings.category };
  for (const p of room.players.values()) p.characterId = "secret";
  startWordPhase(io, room);
  return { room, events, delivery, io, clients, connect, payload, completeAll };
}

test("creación valida playMode, conserva ambos modos y confirma settings en acks y eventos", async (t) => {
  const f = fixture(t);
  // La creación necesita aleatoriedad real para no colisionar con el PIN del fixture.
  t.mock.restoreAll();
  t.mock.method(User, "findByPk", async () => ({ get: () => "Host" }) as any);
  t.mock.method(Character, "findAll", async () => [{ id: "character", name: "Test", imageUrl: null }] as any);
  const token = createAccessToken({ id: "user", username: "Host", email: "test@example.com", gamesPlayed: 0,
    gamesWon: 0, timesImpostor: 0, timesEliminated: 0 });
  let sequence = 0;
  for (const mode of ["classic", "anonymous", "special"] as const) {
    for (const playMode of [undefined, "online", "in_person"] as const) {
      const client = f.connect(`creator-${++sequence}`);
      const ack = await client.call("createRoom", { username: "Host", token, settings: { ...settings, mode, playMode } });
      assert.equal(ack.success, true);
      const created = getRoom(ack.data.room.id)!;
      try {
        assert.equal(created.settings.playMode, playMode ?? "online");
        assert.equal(ack.data.room.settings.playMode, playMode ?? "online");
        assert.equal(ack.data.room.settings.mode, mode);
        const guest = f.connect(`joiner-${sequence}`);
        const joined = await guest.call("joinRoom", { code: created.code, username: "Guest" });
        assert.equal(joined.data.room.settings.playMode, playMode ?? "online");
        await client.call("lobbyReady", { roomId: created.id });
        await guest.call("lobbyReady", { roomId: created.id });
        const third = f.connect(`third-${sequence}`);
        await third.call("joinRoom", { code: created.code, username: "Third" });
        await third.call("lobbyReady", { roomId: created.id });
        const started = await client.call("startGame", { roomId: created.id });
        assert.equal(started.success, true);
        assert.equal(started.data.room.settings.playMode, playMode ?? "online");
        const gameStarted = f.events.find((e) => e.name === "gameStarted" && e.data.room.id === created.id)!;
        assert.equal(gameStarted.data.room.settings.playMode, playMode ?? "online");
        assert.equal(f.events.filter((e) => e.name === "roomUpdated" && e.data.id === created.id)
          .every((e) => e.data.settings.playMode === (playMode ?? "online")), true);
        assert.equal(getGameSnapshot(created, ack.data.session.playerId).room.settings.playMode, playMode ?? "online");
      } finally { deleteRoom(created.id); }
    }
  }
  for (const invalid of [null, "presencial", "", 1, {}]) {
    const client = f.connect(`invalid-${++sequence}`);
    const ack = await client.call("createRoom", { username: "Host", token, settings: { ...settings, playMode: invalid } });
    assert.equal(ack.code, "INVALID_SETTINGS");
    assert.equal(f.events.some((e) => e.target === client.socket.id && e.name === "roomUpdated"), false);
  }
});

test("completeTurn avanza una sola vez, soporta ack perdido y termina en debate sin palabras ni chat", async (t) => {
  const f = fixture(t);
  const host = f.clients.get("host")!;
  const original = f.payload();
  f.events.length = 0;
  await host.call("completeTurn", { ...original, playerId: "a" }, false);
  const deadline = f.room.turnExpiresAt;
  assert.deepEqual(f.events.map((e) => e.name), ["turnCompleted", "turnChanged"]);
  assert.deepEqual(f.events[0].data, { playerId: "host", username: "Host", round: 1, turnIndex: 0, skipped: false });
  for (let i = 0; i < 3; i++) assert.equal((await host.call("completeTurn", original)).success, true);
  assert.equal(f.events.length, 2);
  assert.equal(f.room.currentTurnIndex, 1);
  assert.equal(f.room.turnExpiresAt, deadline);
  assert.equal(f.events[1].data.turnExpiresAt, deadline);
  assert.equal(f.events[1].data.round, 1);
  await f.completeAll();
  assert.equal(f.room.gamePhase, "debate");
  const lastCompleted = f.events.map((e) => e.name).lastIndexOf("turnCompleted");
  assert.equal(f.events[lastCompleted + 1].name, "phaseChanged");
  assert.equal(f.events[lastCompleted + 1].data.phase, "debate");
  assert.equal(f.room.completedTurns.length, 5);
  assert.equal(f.room.turnTimer, null);
  assert.equal(f.events.some((e) => ["wordHintRevealed", "allWordsSubmitted", "chatMessage"].includes(e.name)), false);
  assert.equal([...f.room.players.values()].every((p) => p.word === null), true);
  const before = f.events.length;
  assert.equal((await host.call("completeTurn", original)).success, true);
  assert.equal(f.events.length, before);
  const snapshot = getGameSnapshot(f.room, "host");
  assert.equal(snapshot.completedTurns.length, 5);
  assert.equal(snapshot.hasSubmittedWord, true);
  assert.deepEqual(snapshot.wordHints, []);
  assert.deepEqual(snapshot.chatMessages, []);
});

test("rechaza intrusos, transportes viejos, eliminados, turnos ajenos y payloads obsoletos", async (t) => {
  const f = fixture(t);
  const host = f.clients.get("host")!;
  const guest = f.clients.get("a")!;
  const assertCode = async (client: typeof host, payload: unknown, code: string) =>
    assert.equal((await client.call("completeTurn", payload)).code, code);
  await assertCode(f.connect("outsider"), f.payload(), "NOT_IN_ROOM");
  await assertCode(guest, f.payload(), "NOT_YOUR_TURN");
  await assertCode(host, f.payload(2), "STALE_TURN");
  await assertCode(host, f.payload(1, 1), "STALE_TURN");
  for (const extra of [{ round: undefined }, { turnIndex: -1 }, { round: "1" }, { turnIndex: 0.5 }]) {
    await assertCode(host, { ...f.payload(), ...extra }, "INVALID_PAYLOAD");
  }
  f.room.players.get("host")!.isAlive = false;
  await assertCode(host, f.payload(), "PLAYER_ELIMINATED");
  f.room.players.get("host")!.isAlive = true;
  f.room.gamePhase = "character";
  await assertCode(host, f.payload(), "INVALID_PHASE");
  f.room.gamePhase = "word";
  f.room.settings.playMode = "online";
  await assertCode(host, f.payload(), "INVALID_MODE");
  f.room.settings.playMode = "in_person";
  host.socket.connected = false;
  await assertCode(host, f.payload(), "NOT_IN_ROOM");
  host.socket.connected = true;
  f.room.players.get("host")!.connectionSocketId = "new-transport";
  await assertCode(host, f.payload(), "NOT_IN_ROOM");
  f.room.players.get("host")!.connectionSocketId = host.socket.id;
  const first = f.payload();
  assert.equal((await host.call("completeTurn", first)).success, true);
  await assertCode(guest, first, "STALE_TURN");
  assert.equal(f.room.completedTurns.length, 1);
});

test("vencimiento y confirmación al límite comparten avance único y conservan 60 segundos", async (t) => {
  const f = fixture(t);
  const first = f.payload();
  f.events.length = 0;
  t.mock.timers.tick(GAME_CONFIG.WORD_TURN_TIMEOUT);
  assert.equal(f.room.currentTurnIndex, 1);
  assert.deepEqual(f.events.map((e) => e.name), ["turnCompleted", "turnChanged"]);
  assert.equal(f.events[0].data.skipped, true);
  assert.equal((await f.clients.get("host")!.call("completeTurn", first)).code, "STALE_TURN");
  t.mock.timers.tick(GAME_CONFIG.WORD_TURN_TIMEOUT - 1);
  const second = f.payload();
  assert.equal((await f.clients.get("a")!.call("completeTurn", second)).success, true);
  t.mock.timers.tick(1);
  assert.equal(f.room.currentTurnIndex, 2);
  assert.equal(f.room.completedTurns.length, 2);
  assert.equal(f.room.completedTurns[1].skipped, false);
  t.mock.timers.tick(GAME_CONFIG.WORD_TURN_TIMEOUT);
  assert.equal(f.room.currentTurnIndex, 3);
  assert.equal(f.room.completedTurns.length, 3);
});

for (const action of ["disconnect", "leaveRoom", "kickPlayer", "eliminated"] as const) {
  test(`el turno no queda bloqueado ni se completa dos veces tras ${action}`, async (t) => {
    const f = fixture(t);
    await f.clients.get("host")!.call("completeTurn", f.payload());
    const old = f.payload();
    f.events.length = 0;
    if (action === "disconnect") handlePlayerDisconnect(f.io, f.room, "a");
    else if (action === "eliminated") {
      f.room.players.get("a")!.isAlive = false;
      checkMidGameRemoval(f.io, f.room);
    } else {
      const client = f.clients.get(action === "leaveRoom" ? "a" : "host")!;
      assert.equal((await client.call(action, { roomId: f.room.id, targetId: "a" })).success, true);
    }
    assert.equal(f.room.currentTurnIndex, 2);
    assert.ok(f.events.findIndex((e) => e.name === "turnCompleted") < f.events.findIndex((e) => e.name === "turnChanged"));
    const completion = f.events.find((e) => e.name === "turnCompleted")!;
    assert.deepEqual(completion.data, { playerId: "a", username: "A", round: 1, turnIndex: 1, skipped: true });
    assert.equal((await f.clients.get("a")!.call("completeTurn", old)).success, false);
    t.mock.timers.tick(GAME_CONFIG.WORD_TURN_TIMEOUT);
    assert.equal(f.room.completedTurns.filter((turn) => turn.playerId === "a").length, 1);
  });
}

test("salir antes del turno conserva los índices y completa el turno ausente con su nombre", async (t) => {
  const f = fixture(t);
  await f.clients.get("a")!.call("leaveRoom", { roomId: f.room.id });
  await f.clients.get("host")!.call("completeTurn", f.payload());
  assert.equal(f.room.currentTurnIndex, 2);
  assert.deepEqual(f.room.completedTurns[1], { playerId: "a", username: "A", round: 1, turnIndex: 1, skipped: true });
});

test("recupera identidad, confirmaciones, deadlines y preparación antes de actualizaciones", async (t) => {
  const f = fixture(t);
  const original = f.clients.get("host")!;
  const session = issueRoomSession(f.room, original.socket);
  const first = f.payload();
  await original.call("completeTurn", first, false);
  const deadline = f.room.turnExpiresAt;
  handlePlayerDisconnect(f.io, f.room, "host");
  const restored = f.connect("refreshed");
  f.delivery.length = 0;
  const recovered = await restored.call("resumeRoom", session);
  assert.deepEqual(f.delivery, ["ack:resumeRoom", "roomUpdated"]);
  assert.equal(recovered.success, true);
  assert.equal(recovered.data.playerId, "host");
  assert.equal(recovered.data.room.settings.playMode, "in_person");
  assert.equal(recovered.data.room.currentRound, 1);
  assert.equal(recovered.data.currentTurnPlayerId, "a");
  assert.equal(recovered.data.turnIndex, 1);
  assert.equal(recovered.data.turnExpiresAt, deadline);
  assert.equal(recovered.data.completedTurns.length, 1);
  assert.equal(recovered.data.hasSubmittedWord, true);
  assert.equal(recovered.data.characterAssignment.character, null);
  assert.equal(original.socket.connected, false);
  const count = f.events.length;
  assert.equal((await restored.call("completeTurn", first)).success, true);
  assert.equal(f.events.length, count);
  assert.equal((await original.call("completeTurn", first)).code, "NOT_IN_ROOM");
  await f.completeAll();
  await restored.call("debateReady", { roomId: f.room.id });
  const debate = await restored.call("getGameState", { roomId: f.room.id });
  assert.equal(debate.data.isDebateReady, true);
  assert.deepEqual(debate.data.readyPlayerIds, ["host"]);
  assert.equal(debate.data.phaseExpiresAt, f.room.phaseExpiresAt);
  assert.equal(debate.data.completedTurns.length, 5);
  assert.deepEqual(debate.data.chatMessages, []);
  const dto = getPublicRoom(f.room);
  assert.equal(dto.players.some((p) => "isImpostor" in p || "characterId" in p || "resumeTokenHash" in p), false);
});

for (const visibleVotes of [false, true]) {
  test(`debate oral, votos, resultados, siguiente ronda y lobby conservan privacidad (visibleVotes=${visibleVotes})`, async (t) => {
    const f = fixture(t, { visibleVotes });
    t.mock.method(GameHistory, "create", async () => ({ get: () => "history" }) as any);
    t.mock.method(GamePlayer, "create", async () => ({}) as any);
    await f.completeAll();
    for (const id of f.room.players.keys()) {
      assert.equal((await f.clients.get(id)!.call("submitWord", { roomId: f.room.id, word: "oral" })).code, "INVALID_MODE");
      assert.equal((await f.clients.get(id)!.call("sendChatMessage", { roomId: f.room.id, message: "hola" })).code, "INVALID_MODE");
      await f.clients.get(id)!.call("debateReady", { roomId: f.room.id });
    }
    assert.equal(f.room.gamePhase, "voting");
    assert.equal((await f.clients.get("host")!.call("votePlayer", { roomId: f.room.id, targetId: "missing" })).success, false);
    const vote = (id: string, targetId: string) => f.clients.get(id)!.call("votePlayer", { roomId: f.room.id, targetId });
    for (const id of f.room.players.keys()) {
      assert.equal((await vote(id, id === "a" ? "b" : "a")).success, true);
      if (id === "host") assert.equal((await vote(id, "a")).code, "ALREADY_VOTED");
    }
    assert.equal(f.room.gamePhase, "results");
    const result = f.events.find((e) => e.name === "roundResults")!.data;
    assert.deepEqual(result.wordHints, []);
    assert.equal(Object.keys(result.votes).length, visibleVotes ? 5 : 0);
    for (const e of f.events.filter((e) => e.name === "voteUpdate")) {
      assert.equal(Object.keys(e.data.votes).length > 0, visibleVotes);
      assert.equal(e.data.targetId !== undefined, visibleVotes);
    }
    const resultsSnapshot = getGameSnapshot(f.room, "b");
    assert.equal(Object.keys(resultsSnapshot.votes).length, visibleVotes ? 5 : 0);
    assert.deepEqual(resultsSnapshot.roundResults[0].wordHints, []);
    assert.equal(resultsSnapshot.completedTurns.length, 5);
    assert.equal(f.events.some((e) => e.name === "chatMessage"), false);
    assert.equal(f.room.chatMessages.length, 0);
    t.mock.timers.tick(GAME_CONFIG.PHASE_DURATIONS.results);
    assert.equal(f.room.currentRound, 2);
    assert.equal(f.room.gamePhase, "word");
    assert.equal(f.room.completedTurns.length, 0);
    assert.equal(getGameSnapshot(f.room, "host").hasSubmittedWord, false);
    assert.equal((await f.clients.get("host")!.call("completeTurn", f.payload(1, 0))).code, "STALE_TURN");
    assert.equal((await f.clients.get("a")!.call("completeTurn", f.payload())).code, "PLAYER_ELIMINATED");
    await f.completeAll();
    t.mock.timers.tick(GAME_CONFIG.PHASE_DURATIONS.debate);
    assert.equal(f.room.gamePhase, "voting");
    assert.equal((await vote("a", "host")).code, "PLAYER_NOT_ALIVE");
    for (const id of ["host", "b", "c", "d"]) assert.equal((await vote(id, id === "host" ? "b" : "host")).success, true);
    assert.equal(f.room.status, "waiting");
    assert.equal(f.room.settings.playMode, "in_person");
    assert.equal(f.room.completedTurns.length, 0);
    const ended = f.events.find((e) => e.name === "gameEnded")!.data;
    assert.deepEqual(ended.impostorIds, ["host"]);
    assert.equal(ended.winner, "innocent");
    assert.equal(ended.rounds.length, 2);
    assert.equal(ended.rounds.every((r: any) => Object.keys(r.votes).length === (visibleVotes ? (r.round === 1 ? 5 : 4) : 0)), true);
    assert.equal(f.events.some((e) => e.name === "chatMessage"), false);
  });
}
