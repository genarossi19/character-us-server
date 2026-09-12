# CharacterUs Server

Backend de CharacterUs. Express expone la API HTTP, Socket.IO controla las salas y la partida en tiempo real, y PostgreSQL/Supabase conserva usuarios, catalogo, historial y estadisticas.

El contrato para el frontend esta en [`frontend.md`](./frontend.md).

## Documentacion rapida

- `GET /docs`: Swagger UI interactivo para la API HTTP.
- `GET /openapi.json`: especificacion OpenAPI 3.1 en JSON.
- `GET /docs/socket`: contrato Socket.IO en Markdown. Esta ruta queda como puente hasta incorporar AsyncAPI.

## Runtime

- HTTP y Socket.IO comparten el puerto `3000` por defecto.
- Socket.IO usa exclusivamente el transporte `websocket`.
- El servidor escucha en `0.0.0.0`, para pruebas desde la LAN.
- Las salas, turnos, roles, votos y chat viven en memoria. Un reinicio termina las partidas activas.

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

- `users.password_hash`: hash bcrypt. La API recibe `password`, pero nunca lo persiste en texto plano.
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

## Autenticacion

- `POST /api/auth/signup` registra `username`, `email`, `password` y `confirmPassword`; persiste solo el hash bcrypt.
- `POST /api/auth/login` devuelve un JWT de acceso y el perfil público actual.
- `GET /api/auth/me` devuelve el perfil actualizado a partir de un JWT Bearer válido.
- Los JWT duran una hora, usan `HS256`, emisor y audiencia configurables; nunca contienen hashes ni contraseñas.
- Solo una cuenta con JWT vigente puede enviar `createRoom`; el token se envia en el payload de ese evento y el nombre debe coincidir con la sesión.
- Las mutaciones de categorias y personajes requieren `Authorization: Bearer <token>` de la cuenta configurada como admin.

## Juego

El flujo es `waiting -> character -> word -> debate -> voting -> results`.

- Cada turno de palabra dura hasta 60 segundos.
- Debate y votacion duran 40 segundos.
- El chat esta habilitado durante debate y votacion.
- El valor de ganador emitido y persistido es `innocent` o `impostor`.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia el servidor con nodemon y ts-node. |
| `npx tsc --noEmit` | Verificacion de tipos. |
| `npx ts-node src/db/tests/testConnection.ts` | Prueba manual de conexion PostgreSQL. Revisar la salida: no falla el exit code ante error. |
| `npm run verify:supabase` | Verificacion de solo lectura de Supabase y endpoints. Usar `AUTH_TEST_WRITE=true npm run verify:supabase` para probar registro, login y `/me` con un usuario temporal que se elimina al finalizar. |

`npm run build` conserva una configuracion de emision pendiente: TypeScript valida, pero `noEmit` impide generar `dist/`; por tanto `npm start` no es una verificacion de produccion valida todavia.
