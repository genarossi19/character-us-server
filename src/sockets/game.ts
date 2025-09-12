import { Server as SocketIOServer, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// Estructura para almacenar las salas activas (puedes expandirla en src/data/)
// Record<K, V> significa: Un objeto cuyas claves son de tipo K y cuyos valores son de tipo V
const rooms: Record<string, { hostId: string }> = {};
//ej "sala_1234": { hostId: "socket_A1B2" }

/**
 * Registra los eventos de Socket.IO para el juego CharacterUs.
 * @param io Instancia de Socket.IO Server
 */
export function registerSocketHandlers(io: SocketIOServer) {
  // Evento de conexión de un cliente
  io.on("connection", (socket: Socket) => {
    console.log(` Cliente conectado: ${socket.id}`);
    // console.log("MOSTRANDO EL SOCKET COMPLETO ------->");
    // console.log(socket);

    // Evento: crear una nueva sala de juego. .on indica que escuchamos un evento
    //Recibe el payload del cliente que hiz emit
    // el ack es un callback. Le manda el gameId para que el cliente ejecute la funcion que quiera (callback).
    //Ejecuta la funcion (aunque del lado del cliente)
    socket.on("createRoom", (payload, ack) => {
      console.log("Payload recibido del cliente:", payload);

      const gameId = uuidv4();
      rooms[gameId] = { hostId: socket.id };
      socket.join(gameId);

      ack({ gameId });

      console.log(`Sala creada: ${gameId} por ${socket.id}`);
      console.log("Salas actuales:", rooms);
    });

    // Evento de desconexión
    socket.on("disconnect", () => {
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
