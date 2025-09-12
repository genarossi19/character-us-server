import { Server as SocketIOServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// Estructura para almacenar las salas activas (puedes expandirla en src/data/)
const rooms: Record<string, { hostId: string }> = {};

/**
 * Registra los eventos de Socket.IO para el juego CharacterUs.
 * @param io Instancia de Socket.IO Server
 */
export function registerSocketHandlers(io: SocketIOServer) {
  // Evento de conexión de un cliente
  io.on('connection', (socket: Socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    // Evento: crear una nueva sala de juego
    socket.on('createRoom', (_, callback) => {
      // Generar un gameId único
      const gameId = uuidv4();
      rooms[gameId] = { hostId: socket.id };
      socket.join(gameId);
      // Responder al cliente con el gameId
      callback({ gameId });
      console.log(`Sala creada: ${gameId} por ${socket.id}`);
    });

    // Evento de desconexión
    socket.on('disconnect', () => {
      console.log(`Cliente desconectado: ${socket.id}`);
      // Aquí puedes limpiar recursos o notificar a otros jugadores
    });

    // Puedes agregar más eventos aquí para lógica de juego multijugador
  });
}

// Comentarios:
// - Este archivo centraliza la lógica de eventos de Socket.IO.
// - La función registerSocketHandlers se importa en src/index.ts.
// - rooms es un ejemplo simple de almacenamiento en memoria para salas.
// - Expande la lógica para manejar uniones a salas, mensajes, etc.
