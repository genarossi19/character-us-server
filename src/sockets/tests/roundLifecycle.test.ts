import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server, Socket } from "socket.io";
import { createRoom, joinRoom, deleteRoom, getRoom, getPublicRoom } from "../services/room.service.ts";
import { startCharacterPhase, startVotingPhase, castVote, handlePlayerDisconnect } from "../services/game.service.ts";
import { registerRoomHandlers } from "../handlers/room.handlers.ts";
import { getGameSnapshot } from "../services/session.service.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import Character from "../../db/models/Character.ts";
import GameHistory from "../../db/models/GameHistory.ts";
import GamePlayer from "../../db/models/GamePlayer.ts";

function setup() {
  const room = createRoom("host", "Host", {
    category: "category-id", impostorCount: 1, totalRounds: 3, maxPlayers: 4,
    privacy: "public", mode: "classic", impostorsKnowEachOther: true, visibleVotes: false,
  }, "", null, true, "Test");
  for (const id of ["a", "b"]) joinRoom(id, room.code, id, "", null, true);
  const events: Array<{ target: string; name: string; data: any }> = [];
  const io = {
    to: (target: string) => ({ emit: (name: string, data: any) => events.push({
      target, name, data: JSON.parse(JSON.stringify(data)),
    }) }), sockets: { sockets: new Map() },
  } as unknown as Server;
  return { room, io, events };
}

test("conserva personaje y roles entre rondas y vuelve al mismo lobby al ganar", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { room, io, events } = setup();
  room.settings.maxPlayers = 6;
  for (const id of ["c", "d"]) joinRoom(id, room.code, id, "", null, true);
  room.settings.totalRounds = 1; // No fuerza el final de una partida sin ganador.
  const categories: unknown[] = [];
  let draw = 0;
  t.mock.method(Character, "findAll", async (options: any) => {
    categories.push(options.where.category_id);
    return [{ id: `character-${++draw}`, name: "Personaje", imageUrl: null }] as any;
  });
  t.mock.method(GameHistory, "create", async () => ({ get: () => "history-id" }) as any);
  t.mock.method(GamePlayer, "create", async () => ({}) as any);
  let random = 0;
  t.mock.method(Math, "random", () => random);
  try {
    room.status = "playing";
    room.currentRound = 1;
    await startCharacterPhase(io, room);
    let previousImpostor: string | undefined;
    for (let round = 1; round <= 2; round++) {
      assert.equal(room.currentRound, round);
      assert.equal(room.selectedCharacter!.id, "character-1");
      const players = [...room.players.values()];
      assert(players.every((p) => !p.hasVoted && !p.hasSubmittedWord && !p.isDebateReady));
      assert(players.every((p) => p.word === null && p.votedFor === null));
      const impostors = players.filter((p) => p.isImpostor);
      assert.equal(impostors.length, 1);
      if (previousImpostor) assert.equal(impostors[0].socketId, previousImpostor);
      previousImpostor = impostors[0].socketId;
      for (const player of players) {
        const assignments = events.filter((e) => e.name === "characterAssigned" && e.target === player.socketId);
        const assignment = assignments[assignments.length - 1].data;
        assert.equal(assignment.isImpostor, player.isImpostor);
        assert.equal(assignment.character === null, player.isImpostor);
        const snapshot = getGameSnapshot(room, player.socketId);
        assert.equal(Boolean(assignment.impostorIds), player.isImpostor);
        assert.equal(Boolean(snapshot.characterAssignment?.impostorIds), player.isImpostor);
      }
      assert(!JSON.stringify(getPublicRoom(room)).includes("characterId"));
      assert(!JSON.stringify(getPublicRoom(room)).includes("isImpostor"));
      const alive = players.filter((p) => p.isAlive);
      const target = round === 1 ? alive.find((p) => !p.isImpostor)! : impostors[0];
      startVotingPhase(io, room);
      for (const voter of alive) {
        const targetId = voter === target ? alive.find((p) => p !== target)!.socketId : target.socketId;
        assert.equal(castVote(io, room, voter.socketId, targetId).success, true);
      }
      if (round < 2) {
        assert.equal(room.gamePhase, "results");
        assert.equal(room.status, "playing");
        assert.equal(events.filter((e) => e.name === "gameEnded").length, 0);
        random = round === 1 ? 0.999 : 0;
        t.mock.timers.tick(GAME_CONFIG.PHASE_DURATIONS.results);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(room.gamePhase, "word");
        assert.equal(target.isAlive, false);
        assert.equal(room.turnOrder.includes(target.socketId), false);
        assert.equal(room.votes.size, 0);
        assert.equal(room.chatMessages.length, 0);
      }
    }
    assert.deepEqual(categories, ["category-id"]);
    const endings = events.filter((e) => e.name === "gameEnded");
    assert.equal(endings.length, 1);
    assert.equal(endings[0].data.rounds.length, 2);
    assert.equal(endings[0].data.winner, "innocent");
    assert.equal(room.gamePhase, "waiting");
    assert.equal(getRoom(room.id), room);
    assert.equal(room.players.size, 5);
    assert([...room.players.values()].every((p) => p.isAlive && !p.isImpostor));
    room.status = "playing";
    room.currentRound = 1;
    await startCharacterPhase(io, room);
    assert.equal(room.selectedCharacter!.id, "character-2");
    assert.equal(events.filter((e) => e.name === "characterAssigned").length, 10);
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    deleteRoom(room.id);
    t.mock.timers.reset();
  }
});

for (const action of ["leaveRoom", "kickPlayer", "disconnect", "hostLeave"] as const) {
  test(`cierra y limpia timers al faltar jugadores o cerrar el host: ${action}`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { room, io, events } = setup();
    const handlers = new Map<string, Function>();
    const playerId = action === "leaveRoom" ? "a" : "host";
    registerRoomHandlers(io, {
      id: playerId, data: {}, leave: () => {},
      on: (event: string, handler: Function) => handlers.set(event, handler),
    } as unknown as Socket);
    try {
      room.status = "playing";
      room.gamePhase = "character";
      room.currentRound = 1;
      if (action === "disconnect") {
        handlePlayerDisconnect(io, room, "a");
        t.mock.timers.tick(GAME_CONFIG.RECONNECT_TIMEOUT - 1);
        assert.equal(getRoom(room.id), room);
        assert.equal(events.some((e) => e.name === "roomClosed"), false);
        t.mock.timers.tick(1);
      } else {
        let ack: any;
        const event = action === "hostLeave" ? "leaveRoom" : action;
        await handlers.get(event)!({ roomId: room.id, targetId: "a" }, (result: any) => { ack = result; });
        assert.equal(ack.success, true);
      }
      assert.equal(getRoom(room.id), undefined);
      assert.equal(events.filter((e) => e.name === "roomClosed").length, 1);
      const count = events.length;
      t.mock.timers.tick(120_000);
      assert.equal(events.length, count);
    } finally {
      deleteRoom(room.id);
      t.mock.timers.reset();
    }
  });
}

test("un invitado no puede iniciar la partida ni expulsar jugadores", async () => {
  const { room, io } = setup();
  const handlers = new Map<string, Function>();
  registerRoomHandlers(io, { id: "a", data: {},
    on: (event: string, handler: Function) => handlers.set(event, handler),
  } as unknown as Socket);
  try {
    for (const event of ["startGame", "kickPlayer"]) {
      let ack: any;
      await handlers.get(event)!({ roomId: room.id, targetId: "b" }, (result: any) => { ack = result; });
      assert.equal(ack.code, "NOT_HOST");
    }
    assert.equal(room.status, "waiting");
    assert.equal(room.players.size, 3);
  } finally { deleteRoom(room.id); }
});
