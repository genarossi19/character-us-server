import { v4 as uuidv4 } from "uuid";
import type { Server as SocketIOServer } from "socket.io";
import type { RoomState, PlayerState, RoomSettings } from "../../types/Game.ts";
import { GAME_CONFIG } from "../../config/game.ts";

const rooms = new Map<string, RoomState>();
const pinMap = new Map<number, string>();
const socketToRoom = new Map<string, string>();

export function getRoom(roomId: string): RoomState | undefined {
  return rooms.get(roomId);
}

export function getRoomByCode(code: number): RoomState | undefined {
  const roomId = pinMap.get(code);
  return roomId ? rooms.get(roomId) : undefined;
}

export function getRoomBySocket(socketId: string): RoomState | undefined {
  const roomId = socketToRoom.get(socketId);
  return roomId ? rooms.get(roomId) : undefined;
}

export function forgetSocket(socketId: string): void {
  socketToRoom.delete(socketId);
}

export function assignRandomAvatar(room: RoomState): string {
  const usedAvatars = new Set(
    Array.from(room.players.values()).map((p) => p.avatarUrl)
  );
  const available = GAME_CONFIG.AVATARS.filter((a) => !usedAvatars.has(a.imageUrl));
  if (available.length === 0) {
    const all = GAME_CONFIG.AVATARS;
    return all[Math.floor(Math.random() * all.length)].imageUrl;
  }
  return available[Math.floor(Math.random() * available.length)].imageUrl;
}

export function changeAvatar(
  roomId: string,
  socketId: string,
  avatarId: string
): { room: RoomState; avatarUrl: string } | { error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Sala no encontrada" };

  const player = room.players.get(socketId);
  if (!player) return { error: "No estás en esta sala" };

  const avatar = GAME_CONFIG.AVATARS.find((a) => a.id === avatarId);
  if (!avatar) return { error: "Avatar no válido" };

  const occupied = Array.from(room.players.values()).some(
    (p) => p.socketId !== socketId && p.avatarUrl === avatar.imageUrl
  );
  if (occupied) return { error: "Este avatar ya está en uso" };

  const oldAvatar = player.avatarUrl;
  player.avatarUrl = avatar.imageUrl;
  console.log(`[changeAvatar] player=${socketId} old=${oldAvatar} new=${avatar.imageUrl} roommates=${room.players.size}`);
  return { room, avatarUrl: avatar.imageUrl };
}

export function generateGamePin(): number {
  let pin: number;
  do {
    pin =
      GAME_CONFIG.ROOM.CODE_MIN +
      Math.floor(Math.random() * (GAME_CONFIG.ROOM.CODE_MAX - GAME_CONFIG.ROOM.CODE_MIN + 1));
  } while (pinMap.has(pin));
  return pin;
}

export function createRoom(
  hostSocketId: string,
  username: string,
  settings: RoomSettings,
  avatarUrl: string,
  userId: string | null,
  isGuest: boolean,
  roomName: string
): RoomState {
  const roomId = uuidv4();
  const code = generateGamePin();

  const host: PlayerState = {
    socketId: hostSocketId,
    userId,
    username,
    avatarUrl: "",
    isHost: true,
    isGuest,
    isAlive: true,
    isOnline: true,
    characterId: null,
    isImpostor: false,
    isJoker: false,
    isDebateReady: false,
    hasSubmittedWord: false,
    word: null,
    hasVoted: false,
    votedFor: null,
    disconnectedAt: null,
  };

  const room: RoomState = {
    id: roomId,
    code,
    hostId: hostSocketId,
    name: roomName,
    settings,
    players: new Map([[hostSocketId, host]]),
    status: "waiting",
    gamePhase: "waiting",
    currentRound: 0,
    turnOrder: [],
    currentTurnIndex: 0,
    phaseTimer: null,
    turnTimer: null,
    debateTimer: null,
    inactivityTimer: null,
    inactivityWarningTimer: null,
    inactivityExpiresAt: null,
    votes: new Map(),
    roundResults: [],
    chatMessages: [],
  };

  rooms.set(roomId, room);
  pinMap.set(code, roomId);
  socketToRoom.set(hostSocketId, roomId);

  host.avatarUrl = assignRandomAvatar(room);

  return room;
}

export function joinRoom(
  socketId: string,
  code: number,
  username: string,
  avatarUrl: string,
  userId: string | null,
  isGuest: boolean,
  password?: string
): { room: RoomState; error?: string } {
  const room = getRoomByCode(code);

  if (!room) {
    return { room: null as unknown as RoomState, error: "Sala no encontrada" };
  }

  if (room.settings.password && room.settings.password !== password) {
    return { room: null as unknown as RoomState, error: "Contraseña incorrecta" };
  }

  if (room.status !== "waiting") {
    return { room: null as unknown as RoomState, error: "La sala ya está en juego" };
  }

  const playerCount = Array.from(room.players.values()).length;
  if (playerCount >= room.settings.maxPlayers) {
    return { room: null as unknown as RoomState, error: "Sala llena" };
  }

  const existingUsername = Array.from(room.players.values()).some(
    (p) => p.username === username
  );
  if (existingUsername) {
    return { room: null as unknown as RoomState, error: "El nombre de usuario ya está en uso" };
  }

  const player: PlayerState = {
    socketId,
    userId,
    username,
    avatarUrl: "",
    isHost: false,
    isGuest,
    isAlive: true,
    isOnline: true,
    characterId: null,
    isImpostor: false,
    isJoker: false,
    isDebateReady: false,
    hasSubmittedWord: false,
    word: null,
    hasVoted: false,
    votedFor: null,
    disconnectedAt: null,
  };

  room.players.set(socketId, player);
  socketToRoom.set(socketId, room.id);

  player.avatarUrl = assignRandomAvatar(room);

  return { room };
}

export function removePlayerFromRoom(socketId: string): {
  room: RoomState;
  player: PlayerState;
  wasHost: boolean;
} | null {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return null;

  const room = rooms.get(roomId);
  if (!room) return null;

  const player = room.players.get(socketId);
  if (!player) return null;

  const wasHost = player.isHost;
  if (player.reconnectTimer) clearTimeout(player.reconnectTimer);

  room.players.delete(socketId);
  socketToRoom.delete(socketId);

  return { room, player, wasHost };
}

/** Solo una cuenta registrada puede asumir el rol de host. */
export function assignRoomHost(room: RoomState, socketId: string): boolean {
  const nextHost = room.players.get(socketId);
  if (!nextHost || nextHost.isGuest) return false;

  for (const player of room.players.values()) {
    player.isHost = false;
  }

  nextHost.isHost = true;
  room.hostId = socketId;
  return true;
}

export function deleteRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  clearRoomInactivity(room);

  for (const timer of [room.phaseTimer, room.turnTimer, room.debateTimer]) {
    if (timer) clearTimeout(timer);
  }
  for (const player of room.players.values()) {
    if (player.reconnectTimer) clearTimeout(player.reconnectTimer);
  }

  for (const socketId of room.players.keys()) {
    socketToRoom.delete(socketId);
  }

  pinMap.delete(room.code);
  rooms.delete(roomId);
}

export function closeRoom(roomId: string, reason: string): void {
  deleteRoom(roomId);
}

/**
 * Inicia o renueva el vencimiento de una sala de espera. Una partida en curso
 * administra sus propios temporizadores y no debe cerrarse por inactividad.
 */
export function renewRoomInactivity(io: SocketIOServer, room: RoomState): number | null {
  clearRoomInactivity(room);

  if (room.status !== "waiting") return null;

  const expiresAt = Date.now() + GAME_CONFIG.ROOM.INACTIVITY_TIMEOUT_MS;
  room.inactivityExpiresAt = expiresAt;

  room.inactivityWarningTimer = setTimeout(() => {
    if (rooms.get(room.id) !== room || room.status !== "waiting") return;

    io.to(room.id).emit("roomInactivityWarning", {
      roomId: room.id,
      expiresAt,
      remainingMs: GAME_CONFIG.ROOM.INACTIVITY_WARNING_MS,
    });
  }, GAME_CONFIG.ROOM.INACTIVITY_TIMEOUT_MS - GAME_CONFIG.ROOM.INACTIVITY_WARNING_MS);

  room.inactivityTimer = setTimeout(() => {
    if (rooms.get(room.id) !== room || room.status !== "waiting") return;

    io.to(room.id).emit("roomClosed", {
      reason: "La sala se cerró tras 40 minutos de inactividad",
    });
    closeRoom(room.id, "Inactividad de sala");
  }, GAME_CONFIG.ROOM.INACTIVITY_TIMEOUT_MS);

  return expiresAt;
}

export function clearRoomInactivity(room: RoomState): void {
  if (room.inactivityTimer) {
    clearTimeout(room.inactivityTimer);
    room.inactivityTimer = null;
  }

  if (room.inactivityWarningTimer) {
    clearTimeout(room.inactivityWarningTimer);
    room.inactivityWarningTimer = null;
  }

  room.inactivityExpiresAt = null;
}

export function getPublicRoom(room: RoomState) {
  const { password: _password, ...publicSettings } = room.settings;
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    name: room.name,
    settings: publicSettings,
    players: Array.from(room.players.values()).map((p) => ({
      socketId: p.socketId,
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      isHost: p.isHost,
      isGuest: p.isGuest,
      isAlive: p.isAlive,
      isOnline: p.isOnline,
      hasVoted: p.hasVoted,
      isDebateReady: p.isDebateReady,
    })),
    status: room.status,
    gamePhase: room.gamePhase,
    currentRound: room.currentRound,
    inactivityExpiresAt: room.inactivityExpiresAt,
  };
}
