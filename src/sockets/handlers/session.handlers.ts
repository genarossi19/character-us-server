import type { Server, Socket } from "socket.io";
import { onAction } from "./action.ts";
import { getRoom, getRoomBySocket } from "../services/room.service.ts";
import { getGameSnapshot, getPlayerId, hashResumeToken } from "../services/session.service.ts";
import { handlePlayerReconnect } from "../services/game.service.ts";
import type { Ack, ResumeRoomPayload, RoomSnapshot } from "../../types/socket.ts";
import { GAME_CONFIG } from "../../config/game.ts";

export function registerSessionHandlers(io: Server, socket: Socket): void {
  onAction(socket, "resumeRoom", async (payload: ResumeRoomPayload, callback: Ack<RoomSnapshot>) => {
    if (typeof callback !== "function") return;
    try {
    if (!payload || typeof payload.roomId !== "string" ||
        typeof payload.resumeToken !== "string" || !/^[0-9a-f]{64}$/.test(payload.resumeToken)) {
      return callback({ success: false, code: "INVALID_SESSION", message: "Sesión de sala inválida" });
    }
    const room = getRoom(payload.roomId);
    if (!room) return callback({ success: false, code: "ROOM_NOT_FOUND", message: "La sala ya no existe" });
    const hash = hashResumeToken(payload.resumeToken);
    const player = Array.from(room.players.values()).find((p) => p.resumeTokenHash === hash);
    if (!player || (player.disconnectedAt !== null &&
        Date.now() - player.disconnectedAt >= GAME_CONFIG.RECONNECT_TIMEOUT)) {
      return callback({ success: false, code: "INVALID_SESSION", message: "La sesión de sala venció o no existe" });
    }
    const currentRoom = getRoomBySocket(getPlayerId(socket));
    if (currentRoom && (currentRoom !== room || getPlayerId(socket) !== player.socketId)) {
      return callback({ success: false, code: "ALREADY_IN_ROOM", message: "Ya estás en otra sesión de sala" });
    }

    // Reservar la identidad antes de los awaits evita que una desconexión vieja
    // marque offline al socket que acaba de recuperar la sesión.
    const previous = io.sockets.sockets.get(player.connectionSocketId || player.socketId);
    player.connectionSocketId = socket.id;
    socket.data.playerId = player.socketId;
    if (previous && previous !== socket) {
      previous.data.sessionRevoked = true;
      previous.disconnect(true);
    }
    await socket.join(player.socketId);
    await socket.join(room.id);
    // Los timers continúan corriendo mientras se reconecta.
    if (getRoom(room.id) !== room || room.players.get(player.socketId) !== player ||
        player.connectionSocketId !== socket.id || socket.data.sessionRevoked || !socket.connected) {
      socket.leave(room.id);
      socket.leave(player.socketId);
      delete socket.data.playerId;
      return callback({ success: false, code: "INVALID_SESSION", message: "La sesión de sala venció" });
    }
    handlePlayerReconnect(io, room, player.socketId);
    callback({ success: true, data: getGameSnapshot(room, player.socketId) });
    } catch {
      callback({ success: false, code: "INTERNAL_ERROR", message: "No pudimos recuperar la sesión. Intenta nuevamente." });
    }
  });

  onAction(socket, "getGameState", (payload: { roomId: string }, callback: Ack<RoomSnapshot>) => {
    if (typeof callback !== "function") return;
    const room = getRoomBySocket(getPlayerId(socket));
    if (!room || room.id !== payload?.roomId ||
        room.players.get(getPlayerId(socket))?.connectionSocketId !== socket.id) {
      return callback({ success: false, code: "NOT_IN_ROOM", message: "No estás en esta sala" });
    }
    callback({ success: true, data: getGameSnapshot(room, getPlayerId(socket)) });
  });
}
