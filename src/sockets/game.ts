import { Server as SocketIOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

interface RoomData {
  hostId: string;
  players?: { socketId: string; username: string }[];
  internalId: string;
  gamePin: number;
}

// Salas activas
const rooms: Record<string, RoomData> = {};

// Mapa de PINs para lookup rápido
const pinMap: Record<number, string> = {}; // gamePin -> internalId

/**
 * genera un PIN numérico único de 6 digitos
 */
function generateGamePin(): number {
  let pin: number;
  do {
    pin = Math.floor(100000 + Math.random() * 900000); // 100000 - 999999
  } while (pinMap[pin]); // revisamos en el mapa
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

      // Guardamos el PIN en el mapa
      pinMap[gamePin] = internalId;

      socket.join(internalId);

      if (ack) ack({ internalId, gamePin });

      console.log(`Sala creada: internalId=${internalId}, gamePin=${gamePin}`);
      console.log("Rooms:", rooms);
      console.log("PIN map:", pinMap);
    });

    // Unirse a sala por gamePin
    socket.on("joinRoom", (payload, ack) => {
      const { gamePin, username } = payload;

      const internalId = pinMap[gamePin];
      if (!internalId || !rooms[internalId]) {
        if (ack) ack({ success: false, message: "Sala no existe" });
        return;
      }

      const room = rooms[internalId];

      socket.join(internalId);
      room.players?.push({ socketId: socket.id, username });

      // Ack solo al jugador que se une
      if (ack) ack({ success: true, message: `Unido a la sala ${gamePin}` });

      // Broadcast a los demás de la sala
      socket.to(internalId).emit("playerJoined", { username });

      // Actualizar lista de jugadores para todos
      io.to(internalId).emit("updatePlayers", {
        players: room.players,
        hostId: room.hostId,
      });

      console.log(`Jugador ${username} se unió a la sala gamePin=${gamePin}`);
      console.log("Rooms:", rooms);
      console.log("PIN map:", pinMap);
    });

    // Desconexión (simple)
    socket.on("disconnect", () => {
      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });
}
