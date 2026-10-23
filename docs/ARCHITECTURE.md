# Arquitectura Actual

## Limites del sistema

| Area | Implementacion activa |
| --- | --- |
| Entrypoint | `src/index.ts`: Express, HTTP server y Socket.IO. |
| API HTTP | `src/api/`: auth, categorias, personajes y estadisticas. |
| Juego en tiempo real | `src/sockets/handlers/` y `src/sockets/services/`. |
| Estado de salas | Memoria del proceso en `room.service.ts`. |
| Reglas | `src/game/stateMachine.ts` y `src/game/winConditions.ts`. |
| Persistencia | Sequelize sobre PostgreSQL/Supabase. |
| Administracion | AdminJS bajo `/admin`. |

`src/sockets/game.ts` es codigo historico no registrado por `src/index.ts`; no forma parte del runtime activo.

## Inicio

1. `src/index.ts` crea Express y el servidor HTTP.
2. Registra rutas HTTP bajo `/api` y AdminJS bajo `/admin`.
3. Socket.IO se monta sobre el mismo servidor, con `websocket` como unico transporte.
4. El proceso escucha en `0.0.0.0` y `PORT` (3000 por defecto).

`npm run build` emite JavaScript ESM en `dist/` con TypeScript 5.9 y `rewriteRelativeImportExtensions`: los imports relativos `.ts` se convierten en `.js`. `npm start` ejecuta `dist/index.js`; `npx tsc --noEmit` permite verificar tipos sin emitir archivos. Los contratos del juego se importan desde `src/types/Game.ts`, respetando las mayúsculas del archivo versionado.

## Estado y persistencia

Las salas no se persisten. `RoomState` contiene jugadores, host, PIN, fase, turnos, votos, roles y chat. Todo ese estado se pierde al reiniciar el proceso.

En la sala de espera, el estado también conserva un vencimiento de inactividad en memoria: avisa a los 35 minutos y cierra a los 40 si no hay actividad ni renovación. El temporizador se suspende durante una partida y se reinicia al terminarla.

PostgreSQL conserva:

- `users`: `id`, `username`, `email`, `password_hash`, `google_sub`, estadisticas y timestamps. `username` es el nombre visible y puede repetirse; Google completa ese campo con su nombre. No almacena avatar.
- `category`: catalogo de categorias.
- `character`: personajes con `image` de tipo `TEXT` y `category_id`.
- `game_history`: resumen final de partida. `winner` solo admite `innocent` o `impostor`.
- `game_players`: participacion individual. `user_id` puede ser nulo para invitados.

El avatar es un dato de `PlayerState` y solo existe dentro de una partida/sala.

La identidad de sala se conserva entre conexiones: `PlayerPublic.socketId` pasa
a ser un ID estable, mientras `connectionSocketId` identifica el transporte actual.
Los acks de creación/unión entregan un token aleatorio de recuperación; el backend
solo conserva su hash y nunca lo incluye en payloads públicos. `resumeRoom` vincula
un nuevo transporte a ese jugador y devuelve un snapshot privado de la partida.
La gracia de desconexión es de 60 segundos; recuperar no reinicia timers ni votos.

## Identidad y autorizacion

- Google Identity Services: `POST /api/auth/google` verifica el ID token con `google-auth-library` y emite el mismo JWT local. `users.google_sub` es unico y estable; el nombre de Google se guarda en `users.username`, que no es unico. `password_hash` puede ser nulo para cuentas Google. No se vinculan cuentas por email, excepto la reparacion de cuentas Google anteriores con un alias `google_<hex>`.

- Registro y login devuelven un JWT de acceso de una hora y el perfil público con estadísticas.
- El token se firma con `HS256` y valida emisor, audiencia, expiración y sujeto. No contiene secretos ni `password_hash`.
- `GET /api/auth/me` consulta Supabase para devolver el perfil actualizado de una sesión Bearer válida.
- `createRoom` verifica el token entregado en su payload, asigna su `userId` al host y exige que el `username` coincida con la sesión.
- Unirse a una sala permite invitados y usuarios registrados mediante código. `joinRoom` recibe un `token` opcional: sin token el servidor fija `isGuest: true` y `userId: null`; con token válido obtiene ambos valores de la sesión, sin confiar en campos de identidad enviados por el cliente.
- Las mutaciones REST de catalogo requieren el JWT del email administrador configurado.

## Fases del juego

```text
waiting -> character -> word -> debate -> voting -> results
```

- `character`: asignacion privada. El impostor recibe `character: null`.
- `word`: turnos individuales; cada jugador tiene hasta 60 segundos.
- `debate`: 40 segundos, con chat y posibilidad de adelantar mediante `debateReady` de todos los jugadores vivos.
- `voting`: 40 segundos, un voto definitivo por jugador.
- `results`: 5 segundos entre rondas sin ganador; luego vuelve a `word`. Se conservan personaje, roles y eliminados; se limpian palabras, votos, preparación y chat y se genera otro orden de turnos para los vivos.
- La partida termina al eliminar a todos los impostores (`innocent`) o alcanzar paridad entre impostores y tripulantes (`impostor`). `totalRounds` se conserva por compatibilidad, pero no fuerza el final. Se emite `gameEnded` y luego `roomUpdated` con la misma sala en `waiting`: se conservan PIN, jugadores, avatares y host. Solo el próximo `startGame` sortea personaje y roles de nuevo; puede repetirse por azar.
- Si los participantes restantes bajan de `max(MIN_PLAYERS, impostorCount + 1)`, se cierra la sala con `roomClosed`. Las desconexiones temporales conservan su gracia de 60 segundos antes de quitar al jugador; abandonar o ser expulsado aplica el control inmediatamente. El host también puede cerrar la sala al abandonarla.

El ganador interno, emitido al cliente y persistido es `innocent` o `impostor`.

## Contratos publicos

`RoomPublic` y `PlayerPublic` no incluyen `characterId`, `isImpostor` ni `isJoker`. Las asignaciones de personaje se emiten individualmente con `characterAssigned` para preservar el secreto del rol.

Al terminar la partida, `gameEnded.impostorIds` revela los IDs estables de todos los impostores antes de restablecer la sala. El cliente conserva este resultado final para que el siguiente `roomUpdated` no lo borre. Los roles siguen ausentes de `RoomPublic` y `PlayerPublic` durante la partida.

La especificacion HTTP y Socket.IO completa se mantiene en [`../frontend.md`](../frontend.md).
