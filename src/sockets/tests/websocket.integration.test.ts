import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "../index.ts";
import { createRoom, joinRoom, deleteRoom } from "../services/room.service.ts";
import { issueRoomSession } from "../services/session.service.ts";
import { startWordPhase } from "../services/game.service.ts";

// Cliente mínimo del protocolo Engine.IO/Socket.IO, sin dependencias adicionales.
async function connect(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  const packets: string[] = [];
  const waiters = new Set<() => void>();
  ws.addEventListener("message", (message) => {
    const packet = String(message.data);
    if (packet.startsWith("0")) ws.send("40");
    if (packet === "2") ws.send("3");
    packets.push(packet);
    for (const notify of waiters) notify();
  });
  function waitFor(predicate: (packet: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check);
        reject(new Error("No llegó el paquete esperado"));
      }, 3_000);
      function check() {
        const index = packets.findIndex(predicate);
        if (index < 0) return;
        clearTimeout(timeout);
        waiters.delete(check);
        resolve(packets.splice(index, 1)[0]);
      }
      waiters.add(check);
      check();
    });
  }
  const connected = await waitFor((packet) => packet.startsWith("40"));
  let sequence = 0;
  return {
    id: JSON.parse(connected.slice(2)).sid as string,
    ws,
    emit: (event: string, payload: unknown) => ws.send(`42${JSON.stringify([event, payload])}`),
    event: async (name: string) => JSON.parse((await waitFor((packet) =>
      packet.startsWith("42[") && JSON.parse(packet.slice(2))[0] === name)).slice(2))[1],
    request: async (event: string, payload: unknown) => {
      const id = ++sequence;
      const response = waitFor((packet) => packet.startsWith(`43${id}[`));
      ws.send(`42${id}${JSON.stringify([event, payload])}`);
      return JSON.parse((await response).slice(`43${id}`.length))[0];
    },
  };
}

test("WebSocket real: chat sin ack, rechazo seguro y recuperación tras desconectar", { timeout: 10_000 }, async () => {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  registerSocketHandlers(io);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const address = http.address();
  assert(address && typeof address !== "string");
  let roomId: string | undefined;
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  try {
    const host = await connect(address.port);
    const guest = await connect(address.port);
    clients.push(host, guest);
    const room = createRoom(host.id, "Host", { category: "test", impostorCount: 1,
      totalRounds: 2, maxPlayers: 3, privacy: "public", mode: "classic",
      impostorsKnowEachOther: false, visibleVotes: false }, "", null, true, "Test");
    roomId = room.id;
    joinRoom(guest.id, room.code, "Guest", "", null, true);
    const hostSocket = io.sockets.sockets.get(host.id)!;
    const guestSocket = io.sockets.sockets.get(guest.id)!;
    const session = issueRoomSession(room, hostSocket);
    issueRoomSession(room, guestSocket);
    await hostSocket.join(room.id);
    await guestSocket.join(room.id);
    room.status = "playing";
    room.gamePhase = "debate";
    host.emit("sendChatMessage", { roomId, message: "hola" });
    assert.equal((await guest.event("chatMessage")).message, "hola");
    assert.equal((await host.event("chatMessage")).message, "hola");
    assert.equal((await host.request("getGameState", { roomId })).success, true);
    host.emit("sendChatMessage", { roomId, message: {} });
    assert.equal((await host.event("actionError")).code, "INVALID_MESSAGE");
    assert.equal((await guest.request("getGameState", { roomId })).success, true);

    host.ws.close();
    await guest.event("reconnectTimeout");
    const restored = await connect(address.port);
    clients.push(restored);
    const ack = await restored.request("resumeRoom", session);
    assert.equal(ack.success, true);
    assert.equal(ack.data.playerId, host.id);
    assert.equal(ack.data.chatMessages[0].message, "hola");
    assert.equal(room.players.size, 2);
    assert.equal(room.players.get(host.id)!.isOnline, true);
    assert.equal((await restored.request("getGameState", { roomId })).success, true);
  } finally {
    if (roomId) deleteRoom(roomId);
    for (const client of clients) client.ws.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

test("WebSocket presencial: todos ven un único avance y recuperan el mismo turno tras recargar", { timeout: 10_000 }, async () => {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  registerSocketHandlers(io);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const address = http.address();
  assert(address && typeof address !== "string");
  let roomId: string | undefined;
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  try {
    const host = await connect(address.port);
    const guest = await connect(address.port);
    const third = await connect(address.port);
    clients.push(host, guest, third);
    const byId = new Map(clients.map((client) => [client.id, client]));
    const room = createRoom(host.id, "Host", { category: "test", impostorCount: 1,
      totalRounds: 2, maxPlayers: 3, privacy: "public", mode: "anonymous", playMode: "in_person",
      impostorsKnowEachOther: false, visibleVotes: false }, "", null, true, "Test");
    roomId = room.id;
    joinRoom(guest.id, room.code, "Guest", "", null, true);
    joinRoom(third.id, room.code, "Third", "", null, true);
    const sessions = new Map();
    for (const client of clients) {
      const socket = io.sockets.sockets.get(client.id)!;
      sessions.set(client.id, issueRoomSession(room, socket));
      await socket.join(room.id);
    }
    room.status = "playing";
    room.currentRound = 1;
    room.players.get(host.id)!.isImpostor = true;
    startWordPhase(io, room);
    const firstPlayerId = room.turnOrder[0];
    const active = byId.get(firstPlayerId)!;
    const initialTurns = await Promise.all(clients.map((client) => client.event("turnChanged")));
    assert(initialTurns.every((turn) => turn.playerId === firstPlayerId && turn.turnIndex === 0));
    const payload = { roomId, round: 1, turnIndex: 0 };
    // Ack perdido: el cliente emite sin callback, después reintenta.
    active.emit("completeTurn", payload);
    const completions = await Promise.all(clients.map((client) => client.event("turnCompleted")));
    assert(completions.every((turn) => turn.playerId === firstPlayerId && !turn.skipped));
    const nextTurns = await Promise.all(clients.map((client) => client.event("turnChanged")));
    assert(nextTurns.every((turn) => turn.playerId === room.turnOrder[1] && turn.turnIndex === 1));
    assert.equal((await active.request("completeTurn", payload)).success, true);
    const observer = clients.find((client) => client !== active)!;
    active.ws.close();
    await observer.event("reconnectTimeout");
    const restored = await connect(address.port);
    clients.push(restored);
    const resumed = await restored.request("resumeRoom", sessions.get(firstPlayerId));
    assert.equal(resumed.success, true);
    assert.equal(resumed.data.playerId, firstPlayerId);
    assert.equal(resumed.data.room.settings.playMode, "in_person");
    assert.equal(resumed.data.room.settings.mode, "anonymous");
    assert.equal(resumed.data.completedTurns.length, 1);
    assert.equal(resumed.data.hasSubmittedWord, true);
    assert.equal(resumed.data.currentTurnPlayerId, nextTurns[0].playerId);
    assert.equal(resumed.data.turnExpiresAt, nextTurns[0].turnExpiresAt);
    const peerState = await observer.request("getGameState", { roomId });
    assert.equal(peerState.data.turnIndex, resumed.data.turnIndex);
    assert.deepEqual(peerState.data.completedTurns, resumed.data.completedTurns);
    assert.equal((await restored.request("completeTurn", payload)).success, true);
    assert.equal(room.currentTurnIndex, 1);
    byId.set(firstPlayerId, restored);
    while (room.gamePhase === "word") {
      const current: Awaited<ReturnType<typeof connect>> = byId.get(room.turnOrder[room.currentTurnIndex])!;
      assert.equal((await current.request("completeTurn", { roomId, round: 1, turnIndex: room.currentTurnIndex })).success, true);
    }
    assert.equal(room.gamePhase, "debate");
    assert.equal((await restored.request("submitWord", { roomId, word: "oral" })).code, "INVALID_MODE");
    assert.equal((await restored.request("sendChatMessage", { roomId, message: "hola" })).code, "INVALID_MODE");
    for (const client of byId.values()) assert.equal((await client.request("debateReady", { roomId })).success, true);
    assert.equal(room.gamePhase, "voting");
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i++) {
      assert.equal((await byId.get(ids[i])!.request("votePlayer", { roomId, targetId: ids[(i + 1) % ids.length] })).success, true);
    }
    assert.equal(room.gamePhase, "results");
    const result = await restored.request("getGameState", { roomId });
    assert.deepEqual(result.data.wordHints, []);
    assert.deepEqual(result.data.chatMessages, []);
    assert.deepEqual(result.data.votes, {});
    assert.deepEqual(result.data.roundResults[0].votes, {});
    assert.equal(result.data.completedTurns.length, 3);
  } finally {
    if (roomId) deleteRoom(roomId);
    for (const client of clients) client.ws.close();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
