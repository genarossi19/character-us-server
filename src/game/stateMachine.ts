import type { RoomState, GamePhase, PlayerState } from "../types/game.ts";
import { GAME_CONFIG } from "../config/game.ts";

const PHASE_ORDER: GamePhase[] = ["character", "word", "debate", "voting", "results"];

export function getNextPhase(current: GamePhase): GamePhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export function getPhaseDuration(phase: GamePhase): number {
  const durations = GAME_CONFIG.PHASE_DURATIONS as Record<string, number>;
  return durations[phase] ?? 0;
}

export function getAlivePlayers(room: RoomState): PlayerState[] {
  return Array.from(room.players.values()).filter((p) => p.isAlive && p.isOnline);
}

export function getAliveCount(room: RoomState): number {
  return getAlivePlayers(room).length;
}

export function getOnlinePlayers(room: RoomState): PlayerState[] {
  return Array.from(room.players.values()).filter((p) => p.isOnline);
}

export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function buildTurnOrder(room: RoomState): string[] {
  const alive = getAlivePlayers(room);
  return shuffleArray(alive.map((p) => p.socketId));
}

export function canStartGame(room: RoomState): { ok: boolean; reason?: string } {
  const playerCount = Array.from(room.players.values()).length;
  if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
    return {
      ok: false,
      reason: `Se necesitan mínimo ${GAME_CONFIG.MIN_PLAYERS} jugadores`,
    };
  }
  if (room.status !== "waiting") {
    return { ok: false, reason: "La sala ya está en juego" };
  }
  return { ok: true };
}

export function isPlayerInRoom(
  room: RoomState,
  socketId: string
): PlayerState | null {
  return room.players.get(socketId) ?? null;
}

export function isHost(room: RoomState, socketId: string): boolean {
  return room.hostId === socketId;
}

export function resetPlayerForNewRound(player: PlayerState): void {
  player.hasSubmittedWord = false;
  player.word = null;
  player.hasVoted = false;
  player.votedFor = null;
}

export function prepareRoomForNextRound(room: RoomState): void {
  room.currentRound++;
  room.votes.clear();
  room.turnOrder = buildTurnOrder(room);
  room.currentTurnIndex = 0;
  for (const player of room.players.values()) {
    if (player.isAlive) {
      resetPlayerForNewRound(player);
    }
  }
}
