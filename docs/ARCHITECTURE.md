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

## Estado y persistencia

Las salas no se persisten. `RoomState` contiene jugadores, host, PIN, fase, turnos, votos, roles y chat. Todo ese estado se pierde al reiniciar el proceso.

PostgreSQL conserva:

- `users`: `id`, `username`, `email`, `password_hash`, estadisticas y timestamps. No almacena avatar, nombre ni apellido.
- `category`: catalogo de categorias.
- `character`: personajes con `image` de tipo `TEXT` y `category_id`.
- `game_history`: resumen final de partida. `winner` solo admite `innocent` o `impostor`.
- `game_players`: participacion individual. `user_id` puede ser nulo para invitados.

El avatar es un dato de `PlayerState` y solo existe dentro de una partida/sala.

## Identidad y autorizacion

- Registro y login devuelven un JWT de acceso de una hora y el perfil público con estadísticas.
- El token se firma con `HS256` y valida emisor, audiencia, expiración y sujeto. No contiene secretos ni `password_hash`.
- `GET /api/auth/me` consulta Supabase para devolver el perfil actualizado de una sesión Bearer válida.
- `createRoom` verifica el token entregado en su payload, asigna su `userId` al host y exige que el `username` coincida con la sesión.
- Unirse a una sala permite invitados y usuarios registrados; `userId` es opcional en `joinRoom`.
- Las mutaciones REST de catalogo requieren el JWT del email administrador configurado.

## Fases del juego

```text
waiting -> character -> word -> debate -> voting -> results
```

- `character`: asignacion privada. El impostor recibe `character: null`.
- `word`: turnos individuales; cada jugador tiene hasta 60 segundos.
- `debate`: 40 segundos, con chat y posibilidad de adelantar mediante `debateReady` de todos los jugadores vivos.
- `voting`: 40 segundos, un voto definitivo por jugador.
- `results`: 5 segundos. La partida sigue o finaliza segun `winConditions`.

El ganador interno, emitido al cliente y persistido es `innocent` o `impostor`.

## Contratos publicos

`RoomPublic` y `PlayerPublic` no incluyen `characterId`, `isImpostor` ni `isJoker`. Las asignaciones de personaje se emiten individualmente con `characterAssigned` para preservar el secreto del rol.

La especificacion HTTP y Socket.IO completa se mantiene en [`../frontend.md`](../frontend.md).
