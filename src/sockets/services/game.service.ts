import type { Server as SocketIOServer } from "socket.io";
import type {
  RoomState,
  PlayerState,
  GamePhase,
  RoundResult,
  WordHint,
  ChatMessage,
  PlayerPublic,
} from "../../types/game.ts";
import {
  getPhaseDuration,
  getAlivePlayers,
  buildTurnOrder,
  shuffleArray,
  prepareRoomForNextRound,
} from "../../game/stateMachine.ts";
import { checkWinConditions, calculateVoteResult } from "../../game/winConditions.ts";
import { getRandomCharacterByCategory } from "../../api/services/character/character.service.ts";
import { closeRoom, getPublicRoom } from "./room.service.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import { v4 as uuidv4 } from "uuid";
import GameHistory from "../../db/models/GameHistory.ts";
import GamePlayer from "../../db/models/GamePlayer.ts";
import User from "../../db/models/User.ts";

export function assignCharacters(room: RoomState): void {
  const players = Array.from(room.players.values());

  const impostorIndices = shuffleArray(
    Array.from({ length: players.length }, (_, i) => i)
  ).slice(0, room.settings.impostorCount);

  for (let i = 0; i < players.length; i++) {
    players[i].isImpostor = impostorIndices.includes(i);
    players[i].isJoker = false;
    players[i].isAlive = true;
    players[i].characterId = null;
  }
}

export async function startCharacterPhase(
  io: SocketIOServer,
  room: RoomState
): Promise<void> {
  room.gamePhase = "character";

  try {
    const character = await getRandomCharacterByCategory(
      room.settings.category
    );

    if (!character) {
      io.to(room.hostId).emit("roomClosed", {
        reason: "No hay personajes disponibles para esta categoría",
      });
      closeRoom(room.id, "No hay personajes");
      return;
    }

    assignCharacters(room);

    const impostorIds = room.settings.impostorsKnowEachOther
      ? Array.from(room.players.values())
          .filter((p) => p.isImpostor)
          .map((p) => p.socketId)
      : undefined;

    for (const player of room.players.values()) {
      player.characterId = character.id;

      io.to(player.socketId).emit("characterAssigned", {
        character: {
          id: character.id,
          name: character.name,
          imageUrl: character.imageUrl ?? null,
          category: room.settings.category,
        },
        isImpostor: player.isImpostor,
        impostorIds,
      });
    }

    io.to(room.id).emit("phaseChanged", { phase: "character" });

    startPhaseTimer(io, room, "character");
  } catch (error) {
    console.error("Error asignando personajes:", error);
    io.to(room.hostId).emit("roomClosed", {
      reason: "Error al asignar personajes",
    });
    closeRoom(room.id, "Error al asignar personajes");
  }
}

export function startWordPhase(
  io: SocketIOServer,
  room: RoomState
): void {
  room.gamePhase = "word";
  room.turnOrder = buildTurnOrder(room);
  room.currentTurnIndex = 0;

  io.to(room.id).emit("phaseChanged", { phase: "word" });

  emitCurrentTurn(io, room);

  startPhaseTimer(io, room, "word");
}

function emitCurrentTurn(io: SocketIOServer, room: RoomState): void {
  if (room.currentTurnIndex >= room.turnOrder.length) {
    finishWordPhase(io, room);
    return;
  }

  const currentSocketId = room.turnOrder[room.currentTurnIndex];
  const player = room.players.get(currentSocketId);

  if (!player || !player.isAlive) {
    room.currentTurnIndex++;
    emitCurrentTurn(io, room);
    return;
  }

  io.to(room.id).emit("turnChanged", {
    playerId: player.socketId,
    username: player.username,
    turnIndex: room.currentTurnIndex,
    total: room.turnOrder.length,
  });
}

export function submitWord(
  io: SocketIOServer,
  room: RoomState,
  socketId: string,
  word: string
): { success: boolean; error?: string } {
  if (room.gamePhase !== "word") {
    return { success: false, error: "No es la fase de palabras" };
  }

  const player = room.players.get(socketId);
  if (!player) {
    return { success: false, error: "Jugador no encontrado" };
  }

  if (!player.isAlive) {
    return { success: false, error: "Jugador eliminado no puede submitir" };
  }

  if (player.hasSubmittedWord) {
    return { success: false, error: "Ya submitiste una palabra" };
  }

  if (room.turnOrder[room.currentTurnIndex] !== socketId) {
    return { success: false, error: "No es tu turno" };
  }

  if (!word || word.length === 0) {
    return { success: false, error: "La palabra no puede estar vacía" };
  }

  if (word.length > GAME_CONFIG.WORD.MAX_LENGTH) {
    return {
      success: false,
      error: `La palabra no puede tener más de ${GAME_CONFIG.WORD.MAX_LENGTH} caracteres`,
    };
  }

  player.word = word;
  player.hasSubmittedWord = true;

  io.to(room.id).emit("wordHintRevealed", {
    playerId: player.socketId,
    username: player.username,
  });

  room.currentTurnIndex++;

  const allSubmitted = getAlivePlayers(room).every((p) => p.hasSubmittedWord);
  if (allSubmitted) {
    finishWordPhase(io, room);
  } else {
    emitCurrentTurn(io, room);
  }

  return { success: true };
}

function finishWordPhase(io: SocketIOServer, room: RoomState): void {
  const hints: WordHint[] = getAlivePlayers(room).map((p) => ({
    playerId: p.socketId,
    username: p.username,
    word: p.word || "",
    revealed: true,
  }));

  io.to(room.id).emit("allWordsSubmitted", { hints });

  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  startDebatePhase(io, room);
}

export function startDebatePhase(
  io: SocketIOServer,
  room: RoomState
): void {
  room.gamePhase = "debate";

  io.to(room.id).emit("phaseChanged", { phase: "debate" });

  sendSystemMessage(io, room, "Fase de debate: discutan quién es el impostor");

  startPhaseTimer(io, room, "debate");
}

const lastMessageTimestamp = new Map<string, number>();

export function sendChatMessage(
  io: SocketIOServer,
  room: RoomState,
  socketId: string,
  message: string
): { success: boolean; error?: string } {
  const player = room.players.get(socketId);
  if (!player) {
    return { success: false, error: "Jugador no encontrado" };
  }

  if (!message || message.length === 0) {
    return { success: false, error: "El mensaje no puede estar vacío" };
  }

  if (message.length > GAME_CONFIG.CHAT.MAX_MESSAGE_LENGTH) {
    return {
      success: false,
      error: `El mensaje no puede tener más de ${GAME_CONFIG.CHAT.MAX_MESSAGE_LENGTH} caracteres`,
    };
  }

  const now = Date.now();
  const lastTime = lastMessageTimestamp.get(socketId) || 0;
  if (now - lastTime < GAME_CONFIG.CHAT.FLOOD_LIMIT_MS) {
    return { success: false, error: "Enviando mensajes muy rápido" };
  }
  lastMessageTimestamp.set(socketId, now);

  const isGhost = !player.isAlive;
  const isCurrentPhase = room.gamePhase === "debate" || room.gamePhase === "voting";

  if (!isCurrentPhase) {
    return { success: false, error: "No se pueden enviar mensajes en esta fase" };
  }

  const chatMessage: ChatMessage = {
    id: uuidv4(),
    senderId: player.socketId,
    senderName: player.username,
    message,
    type: isGhost ? "ghost" : "player",
    timestamp: Date.now(),
  };

  room.chatMessages.push(chatMessage);

  if (isGhost) {
    const ghosts = getAlivePlayers(room).filter((p) => !p.isAlive);
    for (const ghost of ghosts) {
      io.to(ghost.socketId).emit("chatMessage", chatMessage);
    }
  } else {
    io.to(room.id).emit("chatMessage", chatMessage);
  }

  return { success: true };
}

export function startVotingPhase(
  io: SocketIOServer,
  room: RoomState
): void {
  room.gamePhase = "voting";
  room.votes.clear();

  for (const player of room.players.values()) {
    if (player.isAlive) {
      player.hasVoted = false;
      player.votedFor = null;
    }
  }

  io.to(room.id).emit("phaseChanged", { phase: "voting" });

  sendSystemMessage(io, room, "Voten por el jugador que creen que es el impostor");

  startPhaseTimer(io, room, "voting");
}

export function castVote(
  io: SocketIOServer,
  room: RoomState,
  voterId: string,
  targetId: string
): { success: boolean; error?: string } {
  if (room.gamePhase !== "voting") {
    return { success: false, error: "No es la fase de votación" };
  }

  const voter = room.players.get(voterId);
  const target = room.players.get(targetId);

  if (!voter || !target) {
    return { success: false, error: "Jugador no encontrado" };
  }

  if (!voter.isAlive) {
    return { success: false, error: "Jugador eliminado no puede votar" };
  }

  if (voter.hasVoted) {
    return { success: false, error: "Ya votaste en esta ronda" };
  }

  if (voterId === targetId) {
    return { success: false, error: "No puedes votarte a ti mismo" };
  }

  if (!target.isAlive) {
    return { success: false, error: "No puedes votar a un jugador eliminado" };
  }

  voter.hasVoted = true;
  voter.votedFor = targetId;
  room.votes.set(voterId, targetId);

  const votesRecord: Record<string, string> = {};
  for (const [v, t] of room.votes) {
    votesRecord[v] = t;
  }

  io.to(room.id).emit("voteUpdate", {
    votes: votesRecord,
    voterId,
    targetId,
  });

  const aliveVoters = getAlivePlayers(room).filter((p) => p.isAlive);
  const allVoted = aliveVoters.every((p) => p.hasVoted);

  if (allVoted) {
    finishVotingPhase(io, room);
  }

  return { success: true };
}

function finishVotingPhase(
  io: SocketIOServer,
  room: RoomState
): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  const result = calculateVoteResult(room.votes, room.players);

  if (result.eliminated) {
    result.eliminated.isAlive = false;

    const eliminatedPublic: PlayerPublic = {
      socketId: result.eliminated.socketId,
      userId: result.eliminated.userId,
      username: result.eliminated.username,
      avatarUrl: result.eliminated.avatarUrl,
      isHost: result.eliminated.isHost,
      isGuest: result.eliminated.isGuest,
      isAlive: false,
      isOnline: result.eliminated.isOnline,
    };

    io.to(room.id).emit("playerEliminated", {
      player: eliminatedPublic,
      wasImpostor: result.wasImpostor,
    });
  }

  const wordHints: WordHint[] = getAlivePlayers(room).map((p) => ({
    playerId: p.socketId,
    username: p.username,
    word: p.word || "",
    revealed: true,
  }));

  const votesRecord: Record<string, string> = {};
  for (const [v, t] of room.votes) {
    votesRecord[v] = t;
  }

  const roundResult: RoundResult = {
    round: room.currentRound,
    eliminatedPlayer: result.eliminated
      ? {
          socketId: result.eliminated.socketId,
          userId: result.eliminated.userId,
          username: result.eliminated.username,
          avatarUrl: result.eliminated.avatarUrl,
          isHost: result.eliminated.isHost,
          isGuest: result.eliminated.isGuest,
          isAlive: false,
          isOnline: result.eliminated.isOnline,
        }
      : null,
    wasImpostor: result.wasImpostor,
    wasJoker: result.wasJoker,
    votes: votesRecord,
    wordHints,
  };

  room.roundResults.push(roundResult);

  io.to(room.id).emit("roundResults", roundResult);

  const winCheck = checkWinConditions(room);

  if (winCheck.gameOver) {
    finishGame(io, room, winCheck.winner!);
    return;
  }

  if (room.currentRound >= room.settings.totalRounds) {
    finishGame(io, room, winCheck.winner || "crew");
    return;
  }

  startResultsPhase(io, room, roundResult);
}

function startResultsPhase(
  io: SocketIOServer,
  room: RoomState,
  _roundResult: RoundResult
): void {
  room.gamePhase = "results";

  startPhaseTimer(io, room, "results");
}

function startPhaseTimer(
  io: SocketIOServer,
  room: RoomState,
  phase: GamePhase
): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
  }

  const duration = getPhaseDuration(phase);
  if (duration === 0) return;

  room.phaseTimer = setTimeout(() => {
    handlePhaseTimeout(io, room, phase);
  }, duration);
}

function handlePhaseTimeout(
  io: SocketIOServer,
  room: RoomState,
  phase: GamePhase
): void {
  room.phaseTimer = null;

  switch (phase) {
    case "character":
      startWordPhase(io, room);
      break;
    case "word":
      finishWordPhase(io, room);
      break;
    case "debate":
      startVotingPhase(io, room);
      break;
    case "voting":
      finishVotingPhase(io, room);
      break;
    case "results": {
      prepareRoomForNextRound(room);
      startCharacterPhase(io, room);
      break;
    }
  }
}

async function persistGameHistory(
  room: RoomState,
  winner: "crew" | "impostor"
): Promise<void> {
  try {
    const players = Array.from(room.players.values());
    const impostorCount = players.filter((p) => p.isImpostor).length;

    const gameHistory = await GameHistory.create({
      room_id: room.id,
      category: room.settings.category,
      winner,
      total_rounds: room.currentRound,
      player_count: players.length,
      impostor_count: impostorCount,
      settings: room.settings as unknown as Record<string, unknown>,
    });

    const gameId = gameHistory.get("id") as string;

    for (const player of players) {
      const lastRound = room.roundResults.find((r) => {
        if (!r.eliminatedPlayer) return false;
        return r.eliminatedPlayer.socketId === player.socketId;
      });

      await GamePlayer.create({
        game_id: gameId,
        user_id: player.userId,
        player_name: player.username,
        was_impostor: player.isImpostor,
        was_eliminated: !player.isAlive,
        survived: player.isAlive,
        eliminated_round: lastRound ? lastRound.round : null,
      });

      if (player.userId && !player.isGuest) {
        try {
          const user = await User.findByPk(player.userId);
          if (user) {
            const updates: Record<string, number> = {
              games_played: (user.get("games_played") as number) + 1,
            };

            if (winner === "crew" && !player.isImpostor) {
              updates.games_won = (user.get("games_won") as number) + 1;
            }

            if (player.isImpostor) {
              updates.times_impostor =
                (user.get("times_impostor") as number) + 1;
            }

            if (!player.isAlive) {
              updates.times_eliminated =
                (user.get("times_eliminated") as number) + 1;
            }

            await user.update(updates);
          }
        } catch (err) {
          console.error("Error actualizando stats del usuario:", err);
        }
      }
    }
  } catch (error) {
    console.error("Error persistiendo historial de partida:", error);
  }
}

function finishGame(
  io: SocketIOServer,
  room: RoomState,
  winner: "crew" | "impostor"
): void {
  room.gamePhase = "finished";
  room.status = "finished";

  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  persistGameHistory(room, winner);

  const allPlayers = Array.from(room.players.values()).map((p) => ({
    socketId: p.socketId,
    userId: p.userId,
    username: p.username,
    avatarUrl: p.avatarUrl,
    isHost: p.isHost,
    isGuest: p.isGuest,
    isAlive: p.isAlive,
    isOnline: p.isOnline,
  }));

  io.to(room.id).emit("gameEnded", {
    winner,
    rounds: room.roundResults,
    players: allPlayers,
  });

  room.status = "waiting";
  room.gamePhase = "waiting";
  room.currentRound = 0;
  room.roundResults = [];
  room.chatMessages = [];

  for (const player of room.players.values()) {
    player.isAlive = true;
    player.isImpostor = false;
    player.isJoker = false;
    player.characterId = null;
    player.hasSubmittedWord = false;
    player.word = null;
    player.hasVoted = false;
    player.votedFor = null;
  }
}

export function handlePlayerDisconnect(
  io: SocketIOServer,
  room: RoomState,
  socketId: string
): void {
  const player = room.players.get(socketId);
  if (!player) return;

  player.isOnline = false;
  player.disconnectedAt = Date.now();

  io.to(room.id).emit("roomUpdated", getPublicRoom(room));

  const timeout = setTimeout(() => {
    const currentPlayer = room.players.get(socketId);
    if (currentPlayer && !currentPlayer.isOnline) {
      const wasHost = currentPlayer.isHost;

      room.players.delete(socketId);

      io.to(room.id).emit("playerLeft", socketId);
      io.to(room.id).emit("roomUpdated", getPublicRoom(room));

      if (wasHost) {
        io.to(room.id).emit("roomClosed", {
          reason: "El host se desconectó",
        });
        closeRoom(room.id, "Host disconnected");
        return;
      }

      checkMidGameRemoval(io, room);
    }
  }, GAME_CONFIG.RECONNECT_TIMEOUT);

  const timerKey = `reconnect_${socketId}`;
  (room as unknown as Record<string, unknown>)[timerKey] = timeout;
}

export function handlePlayerReconnect(
  io: SocketIOServer,
  room: RoomState,
  socketId: string
): void {
  const player = room.players.get(socketId);
  if (!player) return;

  const timerKey = `reconnect_${socketId}`;
  const existingTimer = (room as unknown as Record<string, unknown>)[timerKey] as
    | ReturnType<typeof setTimeout>
    | undefined;
  if (existingTimer) {
    clearTimeout(existingTimer);
    delete (room as unknown as Record<string, unknown>)[timerKey];
  }

  player.isOnline = true;
  player.disconnectedAt = null;

  io.to(room.id).emit("roomUpdated", getPublicRoom(room));
}

function checkMidGameRemoval(
  io: SocketIOServer,
  room: RoomState
): void {
  const winCheck = checkWinConditions(room);

  if (winCheck.gameOver) {
    finishGame(io, room, winCheck.winner!);
  }
}

function sendSystemMessage(
  io: SocketIOServer,
  room: RoomState,
  text: string
): void {
  const msg: ChatMessage = {
    id: uuidv4(),
    senderId: "system",
    senderName: "Sistema",
    message: text,
    type: "system",
    timestamp: Date.now(),
  };

  room.chatMessages.push(msg);
  io.to(room.id).emit("chatMessage", msg);
}
