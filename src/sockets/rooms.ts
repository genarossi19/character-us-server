import { Server as SocketIOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

import { getRandomCharacterByCategory } from "../api/services/character/character.service.ts";
// Tipos de datos
interface PlayerData {
  socketId: string;
  username: string;
  characterId?: string;
  isImpostor?: boolean;
}

interface RoomData {
  hostId: string;
  internalId: string;
  gamePin: number;
  categoryId?: string;
  players: PlayerData[];
  gameStarted?: boolean;
}

// Salas activas
const rooms: Record<string, RoomData> = {};

// Mapa rápido de PINs
const pinMap: Record<number, string> = {}; // gamePin -> internalId

/**
 * Genera PIN único de 6 dígitos
 */
function generateGamePin(): number {
  let pin: number;
  do {
    pin = Math.floor(100000 + Math.random() * 900000);
  } while (pinMap[pin]);
  return pin;
}

/**
 * Función para obtener personajes por categoría de la DB
 */

/**
 * Registra todos los handlers de Socket.io
 */
export function registerSocketHandlers(io: SocketIOServer) {
  io.on("connection", (socket: Socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    /** Crear sala */
    socket.on("createRoom", (payload, ack) => {
      const internalId = uuidv4();
      const gamePin = generateGamePin();

      rooms[internalId] = {
        hostId: socket.id,
        internalId,
        gamePin,
        categoryId: payload.categoryId,
        players: [{ socketId: socket.id, username: payload.username }],
      };

      pinMap[gamePin] = internalId;
      socket.join(internalId);

      if (ack) ack({ internalId, gamePin });

      console.log(`Sala creada: internalId=${internalId}, gamePin=${gamePin}`);
    });

    /** Unirse a sala */
    socket.on("joinRoom", (payload, ack) => {
      const { gamePin, username } = payload;
      const internalId = pinMap[gamePin];
      const room = rooms[internalId];

      if (!room) {
        if (ack) ack({ success: false, message: "Sala no existe" });
        return;
      }

      room.players.push({ socketId: socket.id, username });
      socket.join(internalId);

      io.to(internalId).emit("updatePlayers", {
        players: room.players,
        hostId: room.hostId,
      });

      if (ack) ack({ success: true, message: `Unido a la sala ${gamePin}` });

      console.log(`Jugador ${username} se unió a la sala ${gamePin}`);
    });

    /** Iniciar juego (asigna personaje aleatorio + impostor) */
    socket.on("startGame", async (payload, ack) => {
      const { gamePin } = payload;
      const internalId = pinMap[gamePin];
      const room = rooms[internalId];

      if (!room) {
        if (ack) ack({ success: false, message: "Sala no existe" });
        return;
      }

      if (room.gameStarted) {
        if (ack) ack({ success: false, message: "El juego ya empezó" });
        return;
      }

      room.gameStarted = true;

      // Obtener un personaje aleatorio de la categoría desde el service
      const chosenCharacter = await getRandomCharacterByCategory(
        room.categoryId!
      );

      if (!chosenCharacter) {
        if (ack)
          ack({
            success: false,
            message: "No hay personajes en esa categoría",
          });
        return;
      }

      // Elegir impostor aleatorio
      const impostorIndex = Math.floor(Math.random() * room.players.length);

      room.players.forEach((p, idx) => {
        p.characterId = chosenCharacter.id;
        p.isImpostor = idx === impostorIndex;
      });

      // Emitir a cada jugador de forma individual (PROTEGIDO)
      room.players.forEach((player) => {
        const isPlayerImpostor = player.isImpostor;

        const payloadForPlayer = {
          categoryId: room.categoryId,

          // personaje de la partida (solo si NO es impostor)
          character: isPlayerImpostor ? null : chosenCharacter,

          // solo este jugador sabe si él es impostor
          amIImpostor: isPlayerImpostor,
        };

        io.to(player.socketId).emit("gameStarted", payloadForPlayer);
      });

      if (ack) ack({ success: true });
      console.log(`Partida iniciada en gamePin=${gamePin}`);
    });

    /** Desconexión de jugadores */
    socket.on("disconnect", () => {
      for (const id in rooms) {
        const room = rooms[id];
        const idx = room.players.findIndex((p) => p.socketId === socket.id);
        if (idx !== -1) {
          const username = room.players[idx].username;
          room.players.splice(idx, 1);

          io.to(id).emit("updatePlayers", {
            players: room.players,
            hostId: room.hostId,
          });

          console.log(
            `Jugador ${username} se desconectó de la sala ${room.gamePin}`
          );

          if (room.hostId === socket.id && room.players.length > 0) {
            room.hostId = room.players[0].socketId;
          } else if (room.players.length === 0) {
            delete rooms[id];
            console.log(`Sala ${room.gamePin} eliminada`);
          }

          break;
        }
      }
    });
  });
}
