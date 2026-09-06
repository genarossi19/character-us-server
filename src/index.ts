import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import logger from "morgan";
import path from "path";

import { env } from "./config/env.ts";
import { registerSocketHandlers } from "./sockets/index.ts";
import adminRouter from "./admin/admin.router.ts";
import categoryRoute from "./api/routes/category.routes.ts";
import characterRoute from "./api/routes/character.routes.ts";
import authRoute from "./api/routes/auth.routes.ts";
import statsRoute from "./api/routes/stats.routes.ts";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

app.use(logger("dev"));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

registerSocketHandlers(io);

app.get("/test", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "client", "index.html"));
});

app.use("/admin", adminRouter);
app.use("/api/auth", authRoute);
app.use("/api/category", categoryRoute);
app.use("/api/character", characterRoute);
app.use("/api/stats", statsRoute);

server.listen(env.PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
});
