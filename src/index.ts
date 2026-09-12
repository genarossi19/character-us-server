import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import logger from "morgan";
import path from "path";
import swaggerUi from "swagger-ui-express";

import { env } from "./config/env.ts";
import { registerSocketHandlers } from "./sockets/index.ts";
import adminRouter from "./admin/admin.router.ts";
import categoryRoute from "./api/routes/category.routes.ts";
import characterRoute from "./api/routes/character.routes.ts";
import authRoute from "./api/routes/auth.routes.ts";
import statsRoute from "./api/routes/stats.routes.ts";
import { openApiSpec } from "./docs/openapi.ts";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.use(logger("dev"));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
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

app.get("/player", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "client", "player.html"));
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.get("/docs/socket", (_req, res) => {
  res.type("text/markdown").sendFile(path.join(process.cwd(), "frontend.md"));
});

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, { customSiteTitle: "CharacterUs API Docs" })
);

app.use("/admin", adminRouter);
app.use("/api/auth", authRoute);
app.use("/api/category", categoryRoute);
app.use("/api/character", characterRoute);
app.use("/api/stats", statsRoute);

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Servidor escuchando en http://localhost:${env.PORT}`);
});
