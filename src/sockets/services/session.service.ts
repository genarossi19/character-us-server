import { createHash, randomBytes } from "node:crypto";
import type { Socket } from "socket.io";
import type { RoomState } from "../../types/Game.ts";
import { getPublicRoom } from "./room.service.ts";

export function getPlayerId(socket: Socket): string {
  if (socket.data?.sessionRevoked) return `revoked:${socket.id}`;
  return socket.data?.playerId || socket.id;
}

export function hashResumeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueRoomSession(room: RoomState, socket: Socket) {
  const playerId = getPlayerId(socket);
  const player = room.players.get(playerId)!;
  const resumeToken = randomBytes(32).toString("hex");
  player.resumeTokenHash = hashResumeToken(resumeToken);
  player.connectionSocketId = socket.id;
  socket.data.playerId = playerId;
  socket.join(playerId);
  return { roomId: room.id, playerId, resumeToken };
}

/** Construye únicamente la vista permitida para el jugador que recupera sesión. */
export function getGameSnapshot(room: RoomState, playerId: string) {
  const player = room.players.get(playerId)!;
  const inGame = room.status === "playing";
  return {
    serverTime: Date.now(),
    room: getPublicRoom(room),
    playerId,
    phaseExpiresAt: room.phaseExpiresAt ?? null,
    turnExpiresAt: room.turnExpiresAt ?? null,
    currentTurnPlayerId: room.gamePhase === "word"
      ? room.turnOrder[room.currentTurnIndex] ?? null : null,
    turnIndex: room.currentTurnIndex,
    totalTurns: room.turnOrder.length,
    wordHints: Array.from(room.players.values())
      .filter((p) => p.hasSubmittedWord)
      .map((p) => ({ playerId: p.socketId, username: p.username,
        word: p.word || "", revealed: true, skipped: p.word === "Sin palabra" })),
    characterAssignment: inGame && player.characterId ? {
      character: player.isImpostor ? null : room.selectedCharacter ?? null,
      isImpostor: player.isImpostor,
      ...(player.isImpostor && room.settings.impostorsKnowEachOther ? {
        impostorIds: Array.from(room.players.values()).filter((p) => p.isImpostor).map((p) => p.socketId),
      } : {}),
    } : null,
    hasSubmittedWord: player.hasSubmittedWord,
    hasVoted: player.hasVoted,
    votedFor: player.votedFor,
    isDebateReady: player.isDebateReady,
    votes: room.settings.visibleVotes ? Object.fromEntries(room.votes) : {},
    voterIds: Array.from(room.votes.keys()),
    readyPlayerIds: Array.from(room.players.values()).filter((p) => p.isDebateReady).map((p) => p.socketId),
    chatMessages: room.chatMessages.filter((message) => message.type !== "ghost" || !player.isAlive),
    roundResults: room.roundResults,
  };
}
