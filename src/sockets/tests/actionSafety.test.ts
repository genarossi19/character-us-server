import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server, Socket } from "socket.io";
import { registerGameHandlers } from "../handlers/game.handlers.ts";
import { registerRoomHandlers } from "../handlers/room.handlers.ts";
import { registerSessionHandlers } from "../handlers/session.handlers.ts";
import { createRoom, joinRoom, deleteRoom } from "../services/room.service.ts";
import { startCharacterPhase, startDebatePhase, startVotingPhase } from "../services/game.service.ts";
import { checkWinConditions } from "../../game/winConditions.ts";
import Character from "../../db/models/Character.ts";
const last = <T>(items: T[]) => items[items.length - 1];

test("todas las acciones contienen payloads inválidos y callbacks ausentes", async () => {
  const handlers = new Map<string, Function>();
  const errors: any[] = [];
  const socket = { id: "host", data: {}, on: (event: string, handler: Function) => handlers.set(event, handler),
    emit: (_event: string, data: unknown) => errors.push(data) } as unknown as Socket;
  const io = { to: () => ({ emit: () => {} }) } as unknown as Server;
  registerRoomHandlers(io, socket);
  registerGameHandlers(io, socket);
  registerSessionHandlers(io, socket);
  for (const [event, handler] of handlers) {
    if (event === "disconnect") continue;
    for (const payload of [null, undefined, [], 1, "invalid"]) {
      await assert.doesNotReject(async () => handler(payload));
      assert.equal(last(errors).code, "INVALID_PAYLOAD");
      assert.equal(last(errors).event, event);
    }
  }
  const room = createRoom("host", "Host", { category: "test", impostorCount: 1,
    totalRounds: 3, maxPlayers: 5, privacy: "public", mode: "classic",
    impostorsKnowEachOther: false, visibleVotes: false }, "", null, true, "Test");
  try {
    joinRoom("other", room.code, "Other", "", null, true);
    joinRoom("third", room.code, "Third", "", null, true);
    room.status = "playing";
    room.gamePhase = "debate";
    await assert.doesNotReject(async () => handlers.get("sendChatMessage")!({ roomId: room.id, message: "hola" }));
    assert.equal(last(room.chatMessages).message, "hola");
    await handlers.get("sendChatMessage")!({ roomId: room.id, message: "otra" });
    assert.equal(last(errors).code, "FLOOD_LIMIT");
    await handlers.get("sendChatMessage")!({ roomId: room.id, message: {} });
    assert.equal(last(errors).code, "INVALID_MESSAGE");
    await assert.doesNotReject(async () => handlers.get("debateReady")!({ roomId: room.id }));
    room.gamePhase = "voting";
    await assert.doesNotReject(async () => handlers.get("votePlayer")!({ roomId: room.id, targetId: "other" }));
    assert.equal(room.players.get("host")!.hasVoted, true);
  } finally { deleteRoom(room.id); }
});

test("transiciones, privacidad de votos y eliminación persistente entre rondas", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events: Array<{ name: string; data: any }> = [];
  const io = { to: () => ({ emit: (name: string, data: unknown) => events.push({ name, data }) }) } as unknown as Server;
  const room = createRoom("host", "Host", { category: "test", impostorCount: 1,
    totalRounds: 3, maxPlayers: 5, privacy: "public", mode: "classic",
    impostorsKnowEachOther: false, visibleVotes: false }, "", null, true, "Test");
  try {
    for (const id of ["a", "b", "c", "d"]) joinRoom(id, room.code, id, "", null, true);
    room.status = "playing";
    room.currentRound = 1;
    room.players.get("host")!.isImpostor = true;
    room.players.get("host")!.isOnline = false;
    assert.equal(checkWinConditions(room).gameOver, false);
    room.players.get("host")!.isOnline = true;
    t.mock.method(Character, "findAll", async () => [{ id: "character", name: "Test", imageUrl: null }] as any);
    const handlers = new Map<string, Function>();
    registerGameHandlers(io, { id: "host", on: (event: string, handler: Function) => handlers.set(event, handler) } as unknown as Socket);
    startDebatePhase(io, room);
    t.mock.timers.tick(40_000);
    assert.equal(room.gamePhase, "voting");
    handlers.get("votePlayer")!({ roomId: room.id, targetId: "a" }, () => {});
    assert.deepEqual(events.find((event) => event.name === "voteUpdate")!.data.votes, {});
    t.mock.timers.tick(40_000);
    assert.equal(room.gamePhase, "results");
    assert.equal(last(events.filter((event) => event.name === "phaseChanged")).data.phase, "results");
    assert.equal(room.players.get("a")!.isAlive, false);
    t.mock.timers.tick(5_000);
    assert.equal(room.currentRound, 2);
    assert.equal(room.players.get("a")!.isAlive, false);
    assert.equal([...room.players.values()].filter((p) => p.isImpostor).length, 1);
    assert.equal(room.gamePhase, "word");
    assert.equal(room.turnOrder.includes("a"), false);
  } finally {
    deleteRoom(room.id);
    t.mock.timers.reset();
  }
});
