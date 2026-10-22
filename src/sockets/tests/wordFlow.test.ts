import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server, Socket } from "socket.io";
import { registerGameHandlers } from "../handlers/game.handlers.ts";
import { createRoom, joinRoom, deleteRoom } from "../services/room.service.ts";
import { startWordPhase } from "../services/game.service.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import type { AckError, AckSuccess, SubmitWordPayload } from "../../types/socket.ts";

test("cada palabra se difunde inmediatamente y avanza el turno, incluso sin ack", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const events: Array<{ roomId: string; name: string; data: any }> = [];
  const io = {
    to: (roomId: string) => ({
      emit: (name: string, data: unknown) => events.push({ roomId, name, data }),
    }),
  } as unknown as Server;
  const room = createRoom("host", "Host", {
    category: "test", impostorCount: 1, totalRounds: 1, maxPlayers: 4,
    privacy: "public", mode: "classic", impostorsKnowEachOther: false,
    visibleVotes: true,
  }, "", "user", false, "Test");

  try {
    for (const id of ["guest1", "guest2", "offline"]) {
      joinRoom(id, room.code, id, "", null, true);
    }
    room.status = "playing";
    startWordPhase(io, room);
    room.turnOrder = ["host", "offline", "guest1", "guest2"];
    room.players.get("offline")!.isOnline = false;

    function submit(socketId: string, payload: unknown, withAck = true) {
      const handlers = new Map<string, Function>();
      registerGameHandlers(io, {
        id: socketId,
        on: (name: string, handler: Function) => handlers.set(name, handler),
      } as unknown as Socket);
      let result: AckSuccess | AckError | undefined;
      handlers.get("submitWord")!(payload as SubmitWordPayload,
        withAck ? (response: AckSuccess | AckError) => { result = response; } : undefined);
      return result;
    }

    events.length = 0;
    assert.equal((submit("guest1", { roomId: room.id, word: "antes" }) as AckError).code, "INVALID_TURN");
    assert.equal((submit("host", { roomId: room.id, word: 123 }) as AckError).code, "INVALID_WORD");
    assert.equal((submit("host", null) as AckError).code, "INVALID_PAYLOAD");
    assert.equal((submit("outsider", { roomId: room.id, word: "intruso" }) as AckError).code, "PLAYER_NOT_FOUND");
    assert.equal(events.length, 0);

    assert.doesNotThrow(() => submit("host", { roomId: room.id, word: "  sol  " }, false));
    assert.deepEqual(events.map((event) => event.name), ["wordHintRevealed", "turnChanged"]);
    assert.deepEqual(events[0], { roomId: room.id, name: "wordHintRevealed", data: {
      playerId: "host", username: "Host", word: "sol", skipped: false,
    } });
    assert.equal(events[1].data.playerId, "guest1");
    assert.equal(room.turnOrder[room.currentTurnIndex], "guest1");
    assert.equal((submit("host", { roomId: room.id, word: "otra" }) as AckError).code, "ALREADY_SUBMITTED");

    // Un timeout publica su pista inmediatamente y habilita al siguiente.
    events.length = 0;
    t.mock.timers.tick(GAME_CONFIG.WORD_TURN_TIMEOUT);
    assert.equal(events[0].name, "wordHintRevealed");
    assert.equal(events[0].data.playerId, "guest1");
    assert.equal(events[0].data.skipped, true);
    assert.equal(events[1].name, "turnChanged");
    assert.equal(events[1].data.playerId, "guest2");

    events.length = 0;
    assert.equal(submit("guest2", { roomId: room.id, word: "luna" })!.success, true);
    assert.deepEqual(events.slice(0, 3).map((event) => event.name),
      ["wordHintRevealed", "allWordsSubmitted", "phaseChanged"]);
    assert.equal(events[2].data.phase, "debate");
    assert.equal(room.gamePhase, "debate");
    assert.equal(room.turnTimer, null);
    assert.equal(events[1].data.hints.length, 3);
  } finally {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.debateTimer) clearTimeout(room.debateTimer);
    deleteRoom(room.id);
    t.mock.timers.reset();
  }
});
