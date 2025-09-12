import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerSocketHandlers } from './sockets/game';

// Cargar variables de entorno desde .env
dotenv.config();

// Crear instancia de Express
const app = express();

// Configurar CORS para permitir conexiones desde el frontend
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Middleware para parsear JSON
app.use(express.json());

// Importar rutas (expandible para endpoints REST)
// app.use('/api', require('./routes/api'));

// Crear servidor HTTP y Socket.IO
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: 'http://localhost:5173',
    credentials: true
  }
});

// Registrar manejadores de eventos de Socket.IO
registerSocketHandlers(io);

// Puerto desde .env o 3000 por defecto
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

// Comentarios:
// - Este archivo inicializa el servidor Express y Socket.IO.
// - La función registerSocketHandlers centraliza la lógica de eventos de juego.
// - Puedes agregar rutas REST en src/routes/ y lógica de juego en src/sockets/ y src/data/.
