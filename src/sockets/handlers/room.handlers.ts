import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  StartGamePayload,
  KickPlayerPayload,
  ChangeAvatarPayload,
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
} from "../services/room.service.ts";
import { canStartGame, isHost } from "../../game/stateMachine.ts";
import { startCharacterPhase, handlePlayerDisconnect } from "../services/game.service.ts";
import { verifyAccessToken } from "../../auth/accessToken.ts";
import User from "../../db/models/User.ts";

export function registerRoomHandlers(io: SocketIOServer, socket: Socket): void {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  socket.on("createRoom", async (payload: CreateRoomPayload, ack) => {
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

      if (!payload.username || payload.username.trim().length === 0) {
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

      const room = createRoomService(
        socket.id,
        payload.username.trim(),
        payload.settings,
        "",
        authenticatedUser.id,
        false,
        `Sala de ${payload.username}`
      );

      socket.join(room.id);
      console.log(`[createRoom] ${socket.id} joined room ${room.id} (code ${room.code})`);

      socket.emit("roomUpdated", getPublicRoom(room));

      ack({ success: true, data: { room: getPublicRoom(room) } });
    } catch (error) {
      console.error("Error en createRoom:", error);
      ack({ success: false, message: "No pudimos crear la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("joinRoom", (payload: JoinRoomPayload, ack) => {
    try {
      if (!payload.username || payload.username.trim().length === 0) {
        return ack({ success: false, message: "El nombre de usuario es requerido", code: "INVALID_USERNAME" });
      }

      const result = joinRoomService(
        socket.id,
        payload.code,
        payload.username.trim(),
        "",
        payload.userId || null,
        payload.isGuest,
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
      socket.join(room.id);
      console.log(`[joinRoom] ${socket.id} joined room ${room.id} (code ${room.code}) | players: ${room.players.size}`);

      const publicRoom = getPublicRoom(room);
      const joinedPlayer = publicRoom.players.find((p) => p.socketId === socket.id);

      io.to(room.id).emit("playerJoined", {
        socketId: socket.id,
        userId: payload.userId || null,
        username: payload.username.trim(),
        avatarUrl: joinedPlayer?.avatarUrl || "",
        isHost: false,
        isGuest: payload.isGuest,
        isAlive: true,
        isOnline: true,
      });

      io.to(room.id).emit("roomUpdated", publicRoom);

      ack({ success: true, data: { room: publicRoom } });
    } catch (error) {
      console.error("Error en joinRoom:", error);
      ack({ success: false, message: "No pudimos unirte a la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("leaveRoom", (payload: LeaveRoomPayload, ack) => {
    try {
      const result = removePlayerFromRoom(socket.id);
      if (!result) {
        return ack({ success: false, message: "No estás en ninguna sala", code: "NOT_IN_ROOM" });
      }

      const { room, player, wasHost } = result;

      socket.leave(room.id);

      io.to(room.id).emit("playerLeft", socket.id);

      if (wasHost) {
        if (room.players.size === 0) {
          deleteRoom(room.id);
        } else {
          io.to(room.id).emit("roomClosed", {
            reason: "El host abandonó la sala",
          });
          deleteRoom(room.id);
        }
      } else {
        io.to(room.id).emit("roomUpdated", getPublicRoom(room));
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en leaveRoom:", error);
      ack({ success: false, message: "No pudimos sacarte de la sala. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("startGame", (payload: StartGamePayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({ success: false, message: "Sala no encontrada", code: "ROOM_NOT_FOUND" });
      }

      if (!isHost(room, socket.id)) {
        return ack({ success: false, message: "Solo el host puede iniciar el juego", code: "NOT_HOST" });
      }

      const canStart = canStartGame(room);
      if (!canStart.ok) {
        return ack({ success: false, message: canStart.reason!, code: "MIN_PLAYERS" });
      }

      room.status = "playing";
      room.gamePhase = "character";
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

  socket.on("kickPlayer", (payload: KickPlayerPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({ success: false, message: "Sala no encontrada", code: "ROOM_NOT_FOUND" });
      }

      if (!isHost(room, socket.id)) {
        return ack({ success: false, message: "Solo el host puede expulsar jugadores", code: "NOT_HOST" });
      }

      if (payload.targetId === socket.id) {
        return ack({ success: false, message: "No puedes expulsarte a ti mismo", code: "CANNOT_KICK_SELF" });
      }

      const target = room.players.get(payload.targetId);
      if (!target) {
        return ack({ success: false, message: "Jugador no encontrado", code: "PLAYER_NOT_FOUND" });
      }

      removePlayerFromRoom(payload.targetId);

      const targetSocket = io.sockets.sockets.get(payload.targetId);
      targetSocket?.leave(room.id);

      io.to(payload.targetId).emit("playerKicked", payload.targetId);
      io.to(room.id).emit("playerLeft", payload.targetId);
      io.to(room.id).emit("roomUpdated", getPublicRoom(room));

      ack({ success: true });
    } catch (error) {
      console.error("Error en kickPlayer:", error);
      ack({ success: false, message: "No pudimos expulsar a ese jugador. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("changeAvatar", (payload: ChangeAvatarPayload, ack) => {
    try {
      const room = getRoomBySocket(socket.id);
      if (!room) {
        return ack({ success: false, message: "No estás en ninguna sala", code: "NOT_IN_ROOM" });
      }

      if (room.status !== "waiting") {
        return ack({ success: false, message: "Solo puedes cambiar avatar en la sala de espera", code: "GAME_IN_PROGRESS" });
      }

      const result = changeAvatarService(room.id, socket.id, payload.avatarId);
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

      const publicRoom = getPublicRoom(result.room);
      const playerInRoom = publicRoom.players.find((p) => p.socketId === socket.id);

      const sioRoom = io.sockets.adapter.rooms.get(room.id);
      const sioMembers = sioRoom ? Array.from(sioRoom) : [];
      console.log(`[changeAvatar] ${socket.id} => ${playerInRoom?.avatarUrl} | SIO room members(${sioMembers.length}): ${sioMembers.join(", ")} | players in map: ${publicRoom.players.map((p) => p.socketId).join(", ")}`);

      io.to(room.id).emit("roomUpdated", publicRoom);
      ack({ success: true });
    } catch (error) {
      console.error("Error en changeAvatar:", error);
      ack({ success: false, message: "No pudimos cambiar tu avatar. Intenta nuevamente.", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("disconnect", () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    if (room.status === "playing") {
      handlePlayerDisconnect(io, room, socket.id);
    } else {
      const result = removePlayerFromRoom(socket.id);
      if (!result) return;

      const { wasHost } = result;

      io.to(room.id).emit("playerLeft", socket.id);

      if (wasHost) {
        if (room.players.size === 0) {
          deleteRoom(room.id);
        } else {
          io.to(room.id).emit("roomClosed", {
            reason: "El host se desconectó",
          });
          deleteRoom(room.id);
        }
      } else {
        io.to(room.id).emit("roomUpdated", getPublicRoom(room));
      }
    }
  });
}
