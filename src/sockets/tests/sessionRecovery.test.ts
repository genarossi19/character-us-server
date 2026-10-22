import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server, Socket } from "socket.io";
import { registerSessionHandlers } from "../handlers/session.handlers.ts";
import { registerGameHandlers } from "../handlers/game.handlers.ts";
import { registerRoomHandlers } from "../handlers/room.handlers.ts";
import { issueRoomSession, getGameSnapshot } from "../services/session.service.ts";
import { createRoom, joinRoom, deleteRoom, getRoom, getPublicRoom } from "../services/room.service.ts";
import { handlePlayerDisconnect } from "../services/game.service.ts";
import { GAME_CONFIG } from "../../config/game.ts";

test("recupera identidad, acciones y estado privado; invalida el transporte anterior", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets = new Map<string, Socket>();
  const broadcasts: unknown[] = [];
  const io = { sockets: { sockets }, to: () => ({ emit: (...args: unknown[]) => broadcasts.push(args) }) } as unknown as Server;
  const room = createRoom("host", "Host", {
    category: "test", impostorCount: 1, totalRounds: 2, maxPlayers: 4,
    privacy: "private", password: "secret", mode: "classic",
    impostorsKnowEachOther: false, visibleVotes: false,
  }, "", "user", false, "Test");
  function connect(id: string) {
    const handlers = new Map<string, Function>();
    const socket = {
      id, data: {}, connected: true, rooms: new Set([id]),
      on: (name: string, handler: Function) => handlers.set(name, handler),
      join: (name: string) => socket.rooms.add(name),
      leave: (name: string) => socket.rooms.delete(name),
      disconnect: () => {
        socket.connected = false;
        socket.rooms.clear();
        handlers.get("disconnect")?.();
      },
    };
    const typed = socket as unknown as Socket;
    sockets.set(id, typed);
    registerSessionHandlers(io, typed);
    registerGameHandlers(io, typed);
    registerRoomHandlers(io, typed);
    return { socket: typed, handlers };
  }
  async function call(client: ReturnType<typeof connect>, event: string, payload: unknown) {
    let ack: any;
    await client.handlers.get(event)!(payload, (response: unknown) => { ack = response; });
    return ack;
  }

  try {
    joinRoom("guest", room.code, "Guest", "", null, true, "secret");
    const original = connect("host");
    const guest = connect("guest");
    const session = issueRoomSession(room, original.socket);
    const guestSession = issueRoomSession(room, guest.socket);
    room.status = "playing";
    room.gamePhase = "voting";
    room.currentRound = 1;
    room.phaseExpiresAt = Date.now() + 20_000;
    room.selectedCharacter = { id: "character", name: "Secret character", imageUrl: null, category: "test" };
    const host = room.players.get("host")!;
    host.characterId = "character";
    host.isImpostor = true;
    host.hasVoted = true;
    host.votedFor = "guest";
    room.players.get("guest")!.characterId = "character";
    room.votes.set("host", "guest");
    room.votes.set("guest", "host");
    room.chatMessages.push({ id: "ghost", senderId: "ghost", senderName: "Ghost", message: "private ghost", type: "ghost", timestamp: Date.now() });

    const refreshed = connect("new-transport");
    const invalid = await call(refreshed, "resumeRoom", { roomId: room.id, resumeToken: "0".repeat(64) });
    assert.equal(invalid.code, "INVALID_SESSION");
    assert.equal(original.socket.connected, true);
    const recovered = await call(refreshed, "resumeRoom", session);
    assert.equal(recovered.success, true);
    assert.equal(recovered.data.playerId, "host");
    assert.equal(recovered.data.room.hostId, "host");
    assert.equal(recovered.data.room.players.length, 2);
    assert.equal(recovered.data.phaseExpiresAt, room.phaseExpiresAt);
    assert.equal(recovered.data.hasVoted, true);
    assert.equal(recovered.data.votedFor, "guest");
    assert.deepEqual(recovered.data.votes, {});
    assert.equal(recovered.data.characterAssignment.character, null);
    assert.equal(recovered.data.chatMessages.length, 0);
    assert.equal(original.socket.connected, false);
    assert.equal(host.isOnline, true);
    assert.equal(refreshed.socket.rooms.has("host"), true);
    assert.equal(refreshed.socket.rooms.has(room.id), true);
    assert.equal(JSON.stringify(recovered.data).includes("resumeToken"), false);
    assert.equal(JSON.stringify(getPublicRoom(room)).includes("secret"), false);
    const publicRoom = getPublicRoom(room);
    assert.equal("isImpostor" in publicRoom.players[0], false);

    handlePlayerDisconnect(io, room, "guest");
    t.mock.timers.tick(5_000);
    const returningGuest = connect("new-guest");
    const guestAck = await call(returningGuest, "resumeRoom", guestSession);
    assert.equal(guestAck.success, true);
    assert.equal(guestAck.data.characterAssignment.character.id, "character");
    assert.equal(guestAck.data.room.players.find((p: any) => p.socketId === "guest").isGuest, true);
    t.mock.timers.tick(GAME_CONFIG.RECONNECT_TIMEOUT);
    assert.equal(room.players.has("guest"), true);
    assert.equal(room.players.get("guest")!.reconnectTimer, undefined);

    room.gamePhase = "word";
    room.turnOrder = ["host", "guest"];
    room.currentTurnIndex = 0;
    const sent = await call(refreshed, "submitWord", { roomId: room.id, word: "pista" });
    assert.equal(sent.success, true);
    assert.equal(host.word, "pista");
    const stale = await call(original, "submitWord", { roomId: room.id, word: "otra" });
    assert.equal(stale.code, "PLAYER_NOT_FOUND");
    const snapshot = await call(returningGuest, "getGameState", { roomId: room.id });
    assert.equal(snapshot.data.currentTurnPlayerId, "guest");
    assert.equal(snapshot.data.wordHints[0].word, "pista");
    assert.equal(getGameSnapshot(room, "guest").hasSubmittedWord, false);
    const outsider = connect("outsider");
    assert.equal((await call(outsider, "getGameState", { roomId: room.id })).code, "NOT_IN_ROOM");
    assert.equal((await call(returningGuest, "leaveRoom", { roomId: room.id })).success, true);
    assert.equal(room.players.has("guest"), false);
    assert.equal((await call(returningGuest, "resumeRoom", guestSession)).code, "INVALID_SESSION");
    deleteRoom(room.id);
    assert.equal(getRoom(room.id), undefined);
    assert.equal((await call(refreshed, "resumeRoom", session)).code, "ROOM_NOT_FOUND");
  } finally {
    deleteRoom(room.id);
    t.mock.timers.reset();
  }
});

test("la recuperación vence al terminar la gracia de desconexión del lobby", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const io = { to: () => ({ emit: () => {} }) } as unknown as Server;
  const room = createRoom("host", "Host", {
    category: "test", impostorCount: 1, totalRounds: 1, maxPlayers: 3,
    privacy: "public", mode: "classic", impostorsKnowEachOther: false, visibleVotes: false,
  }, "", "user", false, "Test");
  try {
    handlePlayerDisconnect(io, room, "host");
    assert.equal(room.players.get("host")!.isOnline, false);
    t.mock.timers.tick(GAME_CONFIG.RECONNECT_TIMEOUT - 1);
    assert.equal(room.players.has("host"), true);
    t.mock.timers.tick(1);
    assert.equal(room.players.has("host"), false);
    assert.equal(getRoom(room.id), room);
  } finally {
    deleteRoom(room.id);
    t.mock.timers.reset();
  }
});
