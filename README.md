# CharacterUs Server

## Preparación del lobby

`lobbyReady: { roomId }` confirma preparación del jugador estable de la conexión. Requiere pertenecer a esa sala, estar conectado y que la sala siga en `waiting`; también admite invitados. Responde `{ success: true }` y publica `roomUpdated` con `PlayerPublic.isLobbyReady`. Repetir la confirmación es idempotente. Errores: `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `ROOM_NOT_WAITING` y validación `INVALID_PAYLOAD`.

`startGame` conserva la autorización exclusiva del anfitrión y el mínimo `max(MIN_PLAYERS, impostorCount + 1)`. También exige que todos los miembros, incluido el anfitrión, estén conectados y tengan `isLobbyReady: true`; de lo contrario devuelve `NOT_ALL_READY`. Crear/unirse inicializa el campo en `false`. Terminar una partida lo limpia para todos; desconectarse mientras se espera lo limpia para ese jugador y reconectar requiere otra confirmación. `getPublicRoom` y el snapshot de recuperación incluyen el campo sin exponer roles ni credenciales. La preparación del debate sigue siendo independiente.

Pruebas aisladas sin acceso a PostgreSQL: `node --test src/sockets/tests/lobbyReady.test.mjs src/sockets/tests/gameReveal.test.mjs`.


Backend de CharacterUs. Express expone la API HTTP, Socket.IO controla las salas y la partida en tiempo real, y PostgreSQL/Supabase conserva usuarios, catalogo, historial y estadisticas.

El contrato para el frontend esta en [`frontend.md`](./frontend.md).

## Flujo de ramas

El desarrollo habitual y las correcciones se realizan en `developer`. `main` queda reservada para producción: recibe cambios verificados desde `developer` cuando se decide publicar una versión. Al comenzar una tarea, usar `git switch developer`; publicar desarrollo en `origin/developer` y promoverlo a `main` únicamente al preparar una salida a producción.

## Documentacion rapida

- `GET /docs`: Swagger UI interactivo para la API HTTP.
- `GET /openapi.json`: especificacion OpenAPI 3.1 en JSON.
- `GET /docs/socket`: contrato Socket.IO en Markdown. Esta ruta queda como puente hasta incorporar AsyncAPI.

## Runtime

- HTTP y Socket.IO comparten el puerto `3000` por defecto.
- Socket.IO usa exclusivamente el transporte `websocket`.
- El servidor escucha en `0.0.0.0`, para pruebas desde la LAN.
- Las salas, turnos, roles, votos y chat viven en memoria. Un reinicio termina las partidas activas.
- Una sala en espera avisa a los 35 minutos de inactividad y se cierra a los 40 si no hay actividad ni una renovación del host por Socket.IO.

## Persistencia

El backend no sincroniza ni migra el esquema al iniciar. Supabase debe tener estas tablas:

| Tabla | Uso |
| --- | --- |
| `users` | Cuentas, credenciales bcrypt y estadisticas acumuladas. |
| `category` | Categorias jugables. |
| `character` | Personajes, vinculados por `category_id`. |
| `game_history` | Resumen de cada partida terminada. |
| `game_players` | Participantes y resultado individual de cada partida. |

Campos contractuales relevantes:

- `users.password_hash`: hash bcrypt; puede ser nulo para cuentas Google tras aplicar la migracion. `users.google_sub` identifica de forma unica la cuenta Google y `username` es el nombre visible, que puede repetirse. La API recibe `password`, pero nunca lo persiste en texto plano.
- `character.image`: `TEXT`. La API usa y serializa `imageUrl`; Sequelize lo mapea a la columna `image`.
- `game_history.winner`: enum con solo `innocent` e `impostor`.
- `avatarUrl` no pertenece a `users`; solo identifica al jugador dentro de una sala y se envia por Socket.IO.

## Inicio local

```bash
npm ci
cp .env.example .env
npm run dev
```

Variables requeridas:

| Variable | Uso |
| --- | --- |
| `DB_CONNECTION_STRING` | Conexion PostgreSQL/Supabase. |
| `JWT_SECRET` | Firma y verificacion de JWT. |
| `ADMIN_EMAIL` | Cuenta administradora de AdminJS y rutas de escritura. |
| `ADMIN_HASH` | Hash bcrypt del acceso a AdminJS. |
| `PORT` | Puerto del servidor; por defecto `3000`. |
| `CORS_ORIGIN` | Orígenes adicionales del frontend permitidos, separados por comas, para API y Socket.IO. Incluye por defecto el frontend desplegado en `https://characterus-front.onrender.com`. |

## Autenticacion

- `POST /api/auth/google` autentica con Google Identity Services y devuelve el mismo JWT de acceso. Requiere `GOOGLE_CLIENT_ID` y el esquema de usuarios habilitado para identidades Google.

- `POST /api/auth/signup` registra `username`, `email`, `password` y `confirmPassword`; persiste solo el hash bcrypt.
- `POST /api/auth/login` devuelve un JWT de acceso y el perfil público actual.
- `GET /api/auth/me` devuelve el perfil actualizado a partir de un JWT Bearer válido.
- Los JWT duran una hora, usan `HS256`, emisor y audiencia configurables; nunca contienen hashes ni contraseñas.
- Solo una cuenta con JWT vigente puede enviar `createRoom`. Sin JWT, `joinRoom` solo permite entrar como invitado mediante un código; el servidor no confía en `isGuest` ni `userId` aportados por el cliente.
- Las mutaciones de categorias y personajes requieren `Authorization: Bearer <token>` de la cuenta configurada como admin.

## Juego

El flujo es `waiting -> character -> word -> debate -> voting -> results`.

Sin ganador, `results` vuelve a `word` con el mismo personaje e impostores y sin revivir eliminados. Con ganador, `gameEnded` precede a `roomUpdated` en `waiting`, conservando sala y participantes para otra partida iniciada por el host. `totalRounds` ya no limita la partida.

- Cada turno de palabra dura hasta 60 segundos.
- Debate y votacion duran 40 segundos.
- En `settings.playMode: "online"` (predeterminado), el chat está habilitado durante debate y votación.
- El valor de ganador emitido y persistido es `innocent` o `impostor`.
- `gameEnded` incluye `impostorIds` para revelar nombres y avatares al finalizar; los DTOs públicos de sala siguen sin roles.

El modo presencial se solicita con `settings.playMode: "in_person"`, independiente de `mode`. Las palabras y el debate son orales: `submitWord` y `sendChatMessage` se rechazan con `INVALID_MODE`, incluidos los mensajes de fantasmas. El servidor tampoco genera mensajes de chat para estas salas.

En fase `word`, el jugador en turno envía `completeTurn: { roomId, round, turnIndex }`. El servidor publica `turnCompleted: { playerId, username, round, turnIndex, skipped }` y después `turnChanged` o `phaseChanged` hacia debate. Reintentar una confirmación aceptada devuelve éxito sin repetir el evento ni avanzar otra vez. Vencer los 60 segundos, desconectarse o salir completa el turno con `skipped: true`. `turnChanged` incluye `round` y `turnExpiresAt` (timestamp del servidor).

`resumeRoom` y `getGameState` incluyen `completedTurns`, turno, ronda, deadlines y preparación. En presencial, `hasSubmittedWord` indica que el turno propio terminó; `wordHints` y `chatMessages` están vacíos. Los completados se conservan hasta la siguiente fase `word`. Los votos ocultos tampoco exponen objetivos en `roundResults` ni en su historial.

Pruebas del juego sin acceso a PostgreSQL: `DB_CONNECTION_STRING=postgres://test:test@127.0.0.1:1/test node --test src/sockets/tests/*.test.ts src/sockets/tests/*.test.mjs`. La integración usa clientes WebSocket reales y requiere abrir puertos locales.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia el servidor con nodemon y ts-node. |
| `npm run build` | Compila TypeScript a JavaScript ESM en `dist/`, reescribiendo imports relativos `.ts` a `.js`. |
| `npm start` | Ejecuta `dist/index.js` después de compilar. Requiere las variables del backend. |
| `npx tsc --noEmit` | Verificacion de tipos. |
| `npx ts-node src/db/tests/testConnection.ts` | Prueba manual de conexion PostgreSQL. Revisar la salida: no falla el exit code ante error. |
| `npm run verify:supabase` | Verificacion de solo lectura de Supabase y endpoints. Usar `AUTH_TEST_WRITE=true npm run verify:supabase` para probar registro, login y `/me` con un usuario temporal que se elimina al finalizar. |

TypeScript 5.9 reescribe las extensiones relativas para conservar los imports `.ts` en desarrollo y producir imports `.js` ejecutables por Node en `dist/`.

En Render, usar `npm ci --include=dev && npm run build` como Build Command. El compilador y los paquetes `@types/*` están en `devDependencies`; `--include=dev` evita que una configuración de producción los omita durante el build.
