import type { Server as SocketIOServer, Socket } from "socket.io";
import { onAction } from "./action.ts";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  StartGamePayload,
  KickPlayerPayload,
  ChangeAvatarPayload,
  RenewRoomInactivityPayload,
} from "../../types/socket.ts";
import {
  createRoom as createRoomService,
  joinRoom as joinRoomService,
  removePlayerFromRoom,
  deleteRoom,
  getRoom,
  getRoomBySocket,
  getPublicRoom,
  changeAvatar as changeAvatarService,
  renewRoomInactivity,
  clearRoomInactivity,
  assignRoomHost,
} from "../services/room.service.ts";
import { canStartGame, isHost } from "../../game/stateMachine.ts";
import { startCharacterPhase, handlePlayerDisconnect, checkMidGameRemoval } from "../services/game.service.ts";
import { verifyAccessToken } from "../../auth/accessToken.ts";
import User from "../../db/models/User.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import { getPlayerId, issueRoomSession } from "../services/session.service.ts";

export function registerRoomHandlers(io: SocketIOServer, socket: Socket): void {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function resolveJoinIdentity(payload: JoinRoomPayload): Promise<
    | { userId: string | null; isGuest: boolean }
    | { error: { message: string; code: string } }
  > {
    if (payload.token === undefined) {
      return { userId: null, isGuest: true };
    }

    if (typeof payload.token !== "string" || payload.token.trim().length === 0) {
      return {
        error: { message: "Token inválido o expirado", code: "AUTH_INVALID" },
      };
    }

    const authenticatedUser = verifyAccessToken(payload.token);
    if (!authenticatedUser) {
      return {
        error: { message: "Token inválido o expirado", code: "AUTH_INVALID" },
      };
    }

    const user = await User.findByPk(authenticatedUser.id);
    if (!user) {
      return {
        error: {
          message: "La sesión ya no corresponde a un usuario activo",
          code: "AUTH_INVALID",
        },
      };
    }

    const currentUsername = user.get("username") as string;
    if (payload.username.trim() !== currentUsername) {
      return {
        error: {
          message: "El nombre debe coincidir con la sesión iniciada",
          code: "USERNAME_MISMATCH",
        },
      };
    }

    return { userId: authenticatedUser.id, isGuest: false };
  }

  onAction(socket, "createRoom", async (payload: CreateRoomPayload, ack) => {
    try {
      if (!payload.token) {
        return ack({ success: false, message: "Se requiere autenticación para crear sala", code: "AUTH_REQUIRED" });
      }

      const authenticatedUser = verifyAccessToken(payload.token);
      if (!authenticatedUser) {
        return ack({ success: false, message: "Token inválido o expirado", code: "AUTH_INVALID" });
      }

      const user = await User.findByPk(authenticatedUser.id);
      if (!user) {
        return ack({ success: false, message: "La sesión ya no corresponde a un usuario activo", code: "AUTH_INVALID" });
      }

      const currentUsername = user.get("username") as string;

      if (typeof payload.username !== "string" || payload.username.trim().length === 0) {
        return ack({ success: false, message: "El nombre de usuario es requerido", code: "INVALID_USERNAME" });
      }

      if (payload.username.trim() !== currentUsername) {
        return ack({ success: false, message: "El nombre debe coincidir con la sesión iniciada", code: "USERNAME_MISMATCH" });
      }

      if (!payload.settings) {
        return ack({ success: false, message: "La configuración es requerida", code: "INVALID_SETTINGS" });
      }

      if (!payload.settings.category || !UUID_RE.test(payload.settings.category)) {
        return ack({ success: false, message: "Selecciona una categoría válida.", code: "INVALID_CATEGORY" });
      }

      const settings = payload.settings;
      if (!Number.isInteger(settings.maxPlayers) || settings.maxPlayers < GAME_CONFIG.MIN_PLAYERS ||
          settings.maxPlayers > GAME_CONFIG.MAX_PLAYERS ||
          !Number.isInteger(settings.impostorCount) || settings.impostorCount < 1 ||
          settings.impostorCount >= settings.maxPlayers ||
          !Number.isInteger(settings.totalRounds) || settings.totalRounds < 1 ||
          !["classic", "anonymous", "special"].includes(settings.mode) ||
          !["public", "private"].includes(settings.privacy) ||
          typeof settings.visibleVotes !== "boolean" || typeof settings.impostorsKnowEachOther !== "boolean" ||
          (settings.password !== undefined && typeof settings.password !== "string")) {
        return ack({ success: false, code: "INVALID_SETTINGS", message: "La configuración de la sala no es válida" });
      }

      if (getRoomBySocket(getPlayerId(socket)) || !socket.connected) {
        return ack({ success: false, message: "Ya estás en una sala", code: "ALREADY_IN_ROOM" });
      }

      const room = createRoomService(
        getPlayerId(socket),
        payload.username.trim(),
        payload.settings,
        "",
        authenticatedUser.id,
        false,
        `Sala de ${payload.username}`
      );

      const session = issueRoomSession(room, socket);
      socket.join(room.id);
      renewRoomInactivity(io, room);
      console.log(`[createRoom] ${getPlayerId(socket)} joined room ${room.id} (code ${room.code})`);

      socket.emit("roomUpdated", getPublicRoom(room));

      ack({ success: true, data: { room: getPublicRoom(room), session } });
    } catch (error) {
      console.error("Error en createRoom:", error);
      ack({ success: false, message: "No pudimos crear la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "joinRoom", async (payload: JoinRoomPayload, ack) => {
    try {
      if (!payload || typeof payload.username !== "string" || payload.username.trim().length === 0) {
        return ack({ success: false, message: "El nombre de usuario es requerido", code: "INVALID_USERNAME" });
      }

      if (!Number.isInteger(payload.code) || payload.code < 100_000 || payload.code > 999_999) {
        return ack({ success: false, message: "El código de sala debe tener 6 dígitos", code: "INVALID_ROOM_CODE" });
      }

      if (getRoomBySocket(getPlayerId(socket))) {
        return ack({
          success: false,
          message: "Debes salir de la sala actual antes de unirte a otra",
          code: "ALREADY_IN_ROOM",
        });
      }

      const identity = await resolveJoinIdentity(payload);
      if ("error" in identity) {
        return ack({ success: false, ...identity.error });
      }

      if (getRoomBySocket(getPlayerId(socket)) || !socket.connected) {
        return ack({ success: false, message: "La conexión ya no está disponible para unirse", code: "ALREADY_IN_ROOM" });
      }

      const result = joinRoomService(
        getPlayerId(socket),
        payload.code,
        payload.username.trim(),
        "",
        identity.userId,
        identity.isGuest,
        payload.password
      );

      if (result.error) {
        const codeMap: Record<string, string> = {
          "Sala no encontrada": "ROOM_NOT_FOUND",
          "La sala ya está en juego": "ROOM_ALREADY_STARTED",
          "Sala llena": "ROOM_FULL",
          "El nombre de usuario ya está en uso": "USERNAME_TAKEN",
          "Contraseña incorrecta": "WRONG_PASSWORD",
        };
        return ack({
          success: false,
          message: result.error,
          code: codeMap[result.error] || "JOIN_ERROR",
        });
      }

      const room = result.room;
      const session = issueRoomSession(room, socket);
      const becameHost =
        !room.players.has(room.hostId) &&
        !identity.isGuest &&
        assignRoomHost(room, getPlayerId(socket));
      socket.join(room.id);
      renewRoomInactivity(io, room);
      console.log(`[joinRoom] ${getPlayerId(socket)} joined room ${room.id} (code ${room.code}) | players: ${room.players.size}`);

      const publicRoom = getPublicRoom(room);
      const joinedPlayer = publicRoom.players.find((p) => p.socketId === getPlayerId(socket));

      io.to(room.id).emit("playerJoined", {
        socketId: getPlayerId(socket),
        userId: identity.userId,
        username: payload.username.trim(),
        avatarUrl: joinedPlayer?.avatarUrl || "",
        isHost: becameHost,
        isGuest: identity.isGuest,
        isAlive: true,
        isOnline: true,
      });

      io.to(room.id).emit("roomUpdated", publicRoom);

      ack({ success: true, data: { room: publicRoom, session } });
    } catch (error) {
      console.error("Error en joinRoom:", error);
      ack({ success: false, message: "No pudimos unirte a la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "leaveRoom", (payload: LeaveRoomPayload, ack) => {
    try {
      const result = removePlayerFromRoom(getPlayerId(socket));
      if (!result) {
        return ack({ success: false, message: "No estás en ninguna sala", code: "NOT_IN_ROOM" });
      }

      const { room, player, wasHost } = result;

      socket.leave(room.id);
      socket.leave(player.socketId);
      delete socket.data.playerId;

      io.to(room.id).emit("playerLeft", player.socketId);

      if (wasHost) {
        if (room.players.size === 0) {
          deleteRoom(room.id);
        } else {
          io.to(room.id).emit("roomClosed", {
            reason: "El host abandonó la sala",
          });
          deleteRoom(room.id);
        }
      } else if (!checkMidGameRemoval(io, room)) {
        renewRoomInactivity(io, room);
        io.to(room.id).emit("roomUpdated", getPublicRoom(room));
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en leaveRoom:", error);
      ack({ success: false, message: "No pudimos sacarte de la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "startGame", (payload: StartGamePayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({ success: false, message: "Sala no encontrada", code: "ROOM_NOT_FOUND" });
      }

      if (!isHost(room, getPlayerId(socket))) {
        return ack({ success: false, message: "Solo el host puede iniciar el juego", code: "NOT_HOST" });
      }

      const canStart = canStartGame(room);
      if (!canStart.ok) {
        return ack({ success: false, message: canStart.reason!, code: "MIN_PLAYERS" });
      }

      room.status = "playing";
      room.gamePhase = "character";
      clearRoomInactivity(room);
      room.currentRound = 1;
      room.roundResults = [];
      room.chatMessages = [];

      const publicRoom = getPublicRoom(room);
      io.to(room.id).emit("gameStarted", {
        room: publicRoom,
        totalRounds: room.settings.totalRounds,
      });

      startCharacterPhase(io, room);

      ack({ success: true, data: { room: publicRoom } });
    } catch (error) {
      console.error("Error en startGame:", error);
      ack({ success: false, message: "No pudimos iniciar la partida. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "kickPlayer", (payload: KickPlayerPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({ success: false, message: "Sala no encontrada", code: "ROOM_NOT_FOUND" });
      }

      if (!isHost(room, getPlayerId(socket))) {
        return ack({ success: false, message: "Solo el host puede expulsar jugadores", code: "NOT_HOST" });
      }

      if (payload.targetId === getPlayerId(socket)) {
        return ack({ success: false, message: "No puedes expulsarte a ti mismo", code: "CANNOT_KICK_SELF" });
      }

      const target = room.players.get(payload.targetId);
      if (!target) {
        return ack({ success: false, message: "Jugador no encontrado", code: "PLAYER_NOT_FOUND" });
      }

      removePlayerFromRoom(payload.targetId);

      const targetSocket = io.sockets.sockets.get(target.connectionSocketId || payload.targetId);
      targetSocket?.leave(room.id);
      targetSocket?.leave(target.socketId);

      io.to(payload.targetId).emit("playerKicked", payload.targetId);
      io.to(room.id).emit("playerLeft", payload.targetId);
      if (!checkMidGameRemoval(io, room)) {
        renewRoomInactivity(io, room);
        io.to(room.id).emit("roomUpdated", getPublicRoom(room));
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en kickPlayer:", error);
      ack({ success: false, message: "No pudimos expulsar a ese jugador. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "changeAvatar", (payload: ChangeAvatarPayload, ack) => {
    try {
      const room = getRoomBySocket(getPlayerId(socket));
      if (!room) {
        return ack({ success: false, message: "No estás en ninguna sala", code: "NOT_IN_ROOM" });
      }

      if (room.status !== "waiting") {
        return ack({ success: false, message: "Solo puedes cambiar avatar en la sala de espera", code: "GAME_IN_PROGRESS" });
      }

      if (!payload || typeof payload.avatarId !== "string") {
        return ack({
          success: false,
          message: "Avatar no válido",
          code: "INVALID_AVATAR",
        });
      }

      const result = changeAvatarService(room.id, getPlayerId(socket), payload.avatarId);
      if ("error" in result) {
        const codeMap: Record<string, string> = {
          "Avatar no válido": "INVALID_AVATAR",
          "Este avatar ya está en uso": "AVATAR_TAKEN",
        };
        return ack({
          success: false,
          message: result.error,
          code: codeMap[result.error] || "AVATAR_ERROR",
        });
      }

      renewRoomInactivity(io, result.room);
      const publicRoom = getPublicRoom(result.room);
      const playerInRoom = publicRoom.players.find((p) => p.socketId === getPlayerId(socket));

      const sioRoom = io.sockets.adapter.rooms.get(room.id);
      const sioMembers = sioRoom ? Array.from(sioRoom) : [];
      console.log(`[changeAvatar] ${getPlayerId(socket)} => ${playerInRoom?.avatarUrl} | SIO room members(${sioMembers.length}): ${sioMembers.join(", ")} | players in map: ${publicRoom.players.map((p) => p.socketId).join(", ")}`);

      io.to(room.id).emit("roomUpdated", publicRoom);
      ack({ success: true });
    } catch (error) {
      console.error("Error en changeAvatar:", error);
      ack({ success: false, message: "No pudimos cambiar tu avatar. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  onAction(socket, "renewRoomInactivity", (payload: RenewRoomInactivityPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({ success: false, message: "Sala no encontrada", code: "ROOM_NOT_FOUND" });
      }

      if (!isHost(room, getPlayerId(socket))) {
        return ack({ success: false, message: "Solo el host puede renovar la sala", code: "NOT_HOST" });
      }

      if (room.status !== "waiting") {
        return ack({
          success: false,
          message: "Solo se puede renovar una sala en espera",
          code: "ROOM_NOT_WAITING",
        });
      }

      const expiresAt = renewRoomInactivity(io, room);
      if (!expiresAt) {
        return ack({
          success: false,
          message: "No se pudo renovar la sala",
          code: "ROOM_RENEWAL_FAILED",
        });
      }

      io.to(room.id).emit("roomInactivityRenewed", { roomId: room.id, expiresAt });
      io.to(room.id).emit("roomUpdated", getPublicRoom(room));
      ack({ success: true, data: { expiresAt } });
    } catch (error) {
      console.error("Error renovando inactividad de sala:", error);
      ack({
        success: false,
        message: "No pudimos renovar la sala. Intenta nuevamente.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(getPlayerId(socket));
    if (!room) return;

    const player = room.players.get(getPlayerId(socket));
    if (!player) return;
    if (player.connectionSocketId && player.connectionSocketId !== socket.id) return;

    handlePlayerDisconnect(io, room, getPlayerId(socket));
  });
}
