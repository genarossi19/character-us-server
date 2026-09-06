import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  StartGamePayload,
  KickPlayerPayload,
} from "../../types/socket.ts";
import {
  createRoom as createRoomService,
  joinRoom as joinRoomService,
  removePlayerFromRoom,
  deleteRoom,
  getRoom,
  getPublicRoom,
} from "../services/room.service.ts";
import { canStartGame, isHost, getAlivePlayers } from "../../game/stateMachine.ts";
import { startCharacterPhase, handlePlayerDisconnect, handlePlayerReconnect } from "../services/game.service.ts";

export function registerRoomHandlers(io: SocketIOServer, socket: Socket): void {
  socket.on("createRoom", (payload: CreateRoomPayload, ack) => {
    try {
      if (!payload.username || payload.username.trim().length === 0) {
        return ack({ success: false, message: "El nombre de usuario es requerido", code: "INVALID_USERNAME" });
      }

      if (!payload.settings) {
        return ack({ success: false, message: "La configuración es requerida", code: "INVALID_SETTINGS" });
      }

      const room = createRoomService(
        socket.id,
        payload.username.trim(),
        payload.settings,
        payload.avatarUrl || "",
        null,
        true,
        `Sala de ${payload.username}`
      );

      socket.emit("roomUpdated", getPublicRoom(room));

      ack({ success: true, data: { room: getPublicRoom(room) } });
    } catch (error) {
      console.error("Error en createRoom:", error);
      ack({ success: false, message: "Error al crear sala", code: "INTERNAL_ERROR" });
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
        payload.avatarUrl || "",
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
      const publicRoom = getPublicRoom(room);

      io.to(room.id).emit("playerJoined", {
        socketId: socket.id,
        userId: payload.userId || null,
        username: payload.username.trim(),
        avatarUrl: payload.avatarUrl || "",
        isHost: false,
        isGuest: payload.isGuest,
        isAlive: true,
        isOnline: true,
      });

      io.to(room.id).emit("roomUpdated", publicRoom);

      ack({ success: true, data: { room: publicRoom } });
    } catch (error) {
      console.error("Error en joinRoom:", error);
      ack({ success: false, message: "Error al unirse a la sala", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("leaveRoom", (payload: LeaveRoomPayload, ack) => {
    try {
      const result = removePlayerFromRoom(socket.id);
      if (!result) {
        return ack({ success: false, message: "No estás en ninguna sala", code: "NOT_IN_ROOM" });
      }

      const { room, player, wasHost } = result;

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
      ack({ success: false, message: "Error al salir de la sala", code: "INTERNAL_ERROR" });
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

      const publicRoom = getPublicRoom(room);
      io.to(room.id).emit("gameStarted", {
        room: publicRoom,
        totalRounds: room.settings.totalRounds,
      });

      startCharacterPhase(io, room);

      ack({ success: true, data: { room: publicRoom } });
    } catch (error) {
      console.error("Error en startGame:", error);
      ack({ success: false, message: "Error al iniciar el juego", code: "INTERNAL_ERROR" });
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

      room.players.delete(payload.targetId);

      io.to(payload.targetId).emit("playerKicked", payload.targetId);
      io.to(room.id).emit("playerLeft", payload.targetId);
      io.to(room.id).emit("roomUpdated", getPublicRoom(room));

      ack({ success: true });
    } catch (error) {
      console.error("Error en kickPlayer:", error);
      ack({ success: false, message: "Error al expulsar jugador", code: "INTERNAL_ERROR" });
    }
  });

  socket.on("disconnect", () => {
    const result = removePlayerFromRoom(socket.id);
    if (!result) return;

    const { room, player, wasHost } = result;

    if (room.status === "playing") {
      handlePlayerDisconnect(io, room, socket.id);
    } else {
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
