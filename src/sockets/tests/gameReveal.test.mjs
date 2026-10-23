import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console, setTimeout: () => 1, clearTimeout: () => {},
    require(name) {
      assert.ok(name in dependencies, `Unexpected import: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

test("gameEnded reveals all impostors only at the end and preserves public player DTOs", async () => {
  const config = load("../../config/game.ts");
  const machine = load("../../game/stateMachine.ts", { "../config/game.ts": config });
  const rules = load("../../game/winConditions.ts", { "./stateMachine.ts": machine });
  let sequence = 0;
  const model = { create: async () => ({ get: () => "history-id" }) };
  const game = load("../services/game.service.ts", {
    "../../game/stateMachine.ts": machine,
    "../../game/winConditions.ts": rules,
    "../../api/services/character/character.service.ts": {},
    "./room.service.ts": { getPublicRoom: (room) => ({ id: room.id }), renewRoomInactivity: () => {} },
    "../../config/game.ts": config,
    uuid: { v4: () => `id-${++sequence}` },
    "../../db/models/GameHistory.ts": { default: model },
    "../../db/models/GamePlayer.ts": { default: model },
    "../../db/models/User.ts": { default: {} },
  });
  for (const impostorCount of [1, 2]) {
    const events = [];
    const ids = impostorCount === 1 ? ["host", "crew-a", "crew-b"] : ["host", "other-impostor", "crew-a", "crew-b", "crew-c"];
    const players = new Map(ids.map((id, index) => [id, {
      socketId: id, username: id, avatarUrl: `/${id}.webp`, userId: null, isGuest: true,
      isHost: index === 0, isAlive: true, isOnline: true, hasVoted: false,
      isImpostor: index < impostorCount, isJoker: false, hasSubmittedWord: true, word: "pista",
    }]));
    const room = { id: "room", players, votes: new Map(), roundResults: [], chatMessages: [],
      gamePhase: "word", status: "playing", currentRound: 1,
      settings: { totalRounds: 1, visibleVotes: false, category: "test", impostorCount } };
    const io = { to: () => ({ emit: (name, data) => events.push({ name, data: JSON.parse(JSON.stringify(data)) }) }) };
    game.startVotingPhase(io, room);
    assert.equal(events.some((event) => event.name === "gameEnded"), false);
    for (const id of ids.slice(0, -1)) {
      assert.equal(game.castVote(io, room, id, id === "crew-a" ? "crew-b" : "crew-a").success, true);
      assert.equal(events.some((event) => "impostorIds" in event.data), false);
    }
    assert.equal(game.castVote(io, room, ids.at(-1), "crew-a").success, true);
    const result = events.find((event) => event.name === "gameEnded").data;
    assert.equal(result.winner, "impostor");
    assert.deepEqual(result.impostorIds, ids.slice(0, impostorCount));
    assert.equal(result.players.some((player) => "isImpostor" in player || "characterId" in player), false);
    assert.equal(events.filter((event) => "impostorIds" in event.data).length, 1);
    assert.equal(room.gamePhase, "waiting");
    assert.equal([...players.values()].some((player) => player.isImpostor), false);
    assert.equal(result.impostorIds.length, impostorCount, "final payload survives the lobby reset");
  }
  await new Promise((resolve) => setImmediate(resolve));
});
