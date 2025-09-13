import { Server as SocketIOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

interface RoomData {
  hostId: string;
  players?: { socketId: string; username: string }[];
  internalId: string;
  gamePin: number;
}

// Almacenamos las salas activas en memoria
const rooms: Record<string, RoomData> = {};

/**
 * Genera un PIN numérico único de 6 dígitos
 */
function generateGamePin(): number {
  let pin: number;
  do {
    pin = Math.floor(100000 + Math.random() * 900000); // 100000 - 999999
  } while (Object.values(rooms).some((r) => r.gamePin === pin));
  return pin;
}

export function registerSocketHandlers(io: SocketIOServer) {
  io.on("connection", (socket: Socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    // Crear sala
    socket.on("createRoom", (payload, ack) => {
      const internalId = uuidv4();
      const gamePin = generateGamePin();

      rooms[internalId] = {
        hostId: socket.id,
        internalId,
        gamePin,
        players: [{ socketId: socket.id, username: payload.username }],
      };

      socket.join(internalId);

      if (ack) ack({ internalId, gamePin });

      console.log(`Sala creada: internalId=${internalId}, gamePin=${gamePin}`);
    });

    // Unirse a sala por gamePin

    // Unirse a sala por gamePin
    socket.on("joinRoom", (payload, ack) => {
      const { gamePin, username } = payload;

      const room = Object.values(rooms).find((r) => r.gamePin === gamePin);
      if (!room) {
        if (ack) ack({ success: false, message: "Sala no existe" });
        return;
      }

      socket.join(room.internalId);
      room.players?.push({ socketId: socket.id, username });

      // Ack solo al jugador que se une
      if (ack) ack({ success: true, message: `Unido a la sala ${gamePin}` });

      // Broadcast a los demás de la sala
      socket.to(room.internalId).emit("playerJoined", { username });

      // Actualizar lista de jugadores para todos
      io.to(room.internalId).emit("updatePlayers", {
        players: room.players,
        hostId: room.hostId,
      });
    });
  });
}
