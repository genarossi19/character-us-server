import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "../index.ts";
import { createRoom, joinRoom, deleteRoom } from "../services/room.service.ts";
import { issueRoomSession } from "../services/session.service.ts";

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
