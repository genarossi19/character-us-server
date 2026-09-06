import type { Server as SocketIOServer } from "socket.io";
import { registerRoomHandlers } from "./handlers/room.handlers.ts";
import { registerGameHandlers } from "./handlers/game.handlers.ts";

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    console.log(`[SOCKET] Cliente conectado: ${socket.id}`);

    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      console.log(
        `[SOCKET] Cliente desconectado: ${socket.id} - Razón: ${reason}`
      );
    });

    socket.on("error", (error) => {
      console.error(`[SOCKET] Error en ${socket.id}:`, error);
    });
  });
}
