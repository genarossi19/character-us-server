import type { RoomState, GameWinner, PlayerState } from "../types/Game.ts";
import { getAlivePlayers } from "./stateMachine.ts";

export interface WinCheckResult {
  gameOver: boolean;
  winner?: GameWinner;
}

export function checkWinConditions(room: RoomState): WinCheckResult {
  const alive = getAlivePlayers(room);
  const aliveCount = alive.length;

  if (aliveCount === 0) {
    return { gameOver: true, winner: "impostor" };
  }

  const aliveImpostors = alive.filter((p) => p.isImpostor);
  const aliveCrew = alive.filter((p) => !p.isImpostor && !p.isJoker);
  const aliveJokers = alive.filter((p) => p.isJoker);

  const impostorCount = aliveImpostors.length;
  const crewCount = aliveCrew.length;

  if (impostorCount === 0) {
    return { gameOver: true, winner: "innocent" };
  }

  if (impostorCount >= crewCount && aliveJokers.length === 0) {
    return { gameOver: true, winner: "impostor" };
  }

  if (aliveCount <= 1) {
    return { gameOver: true, winner: "impostor" };
  }

  return { gameOver: false };
}

export function calculateVoteResult(
  votes: Map<string, string>,
  players: Map<string, PlayerState>
): { eliminated: PlayerState | null; wasImpostor: boolean; wasJoker: boolean; isTie: boolean } {
  const voteCounts = new Map<string, number>();

  for (const targetId of votes.values()) {
    voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
  }

  let maxVotes = 0;
  let topCandidates: string[] = [];

  for (const [targetId, count] of voteCounts) {
    if (count > maxVotes) {
      maxVotes = count;
      topCandidates = [targetId];
    } else if (count === maxVotes) {
      topCandidates.push(targetId);
    }
  }

  if (topCandidates.length !== 1 || maxVotes === 0) {
    return { eliminated: null, wasImpostor: false, wasJoker: false, isTie: true };
  }

  const eliminatedId = topCandidates[0];
  const eliminated = players.get(eliminatedId) ?? null;

  if (!eliminated) {
    return { eliminated: null, wasImpostor: false, wasJoker: false, isTie: true };
  }

  return {
    eliminated,
    wasImpostor: eliminated.isImpostor,
    wasJoker: eliminated.isJoker,
    isTie: false,
  };
}
