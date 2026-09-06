# CharacterUs Server

Backend de un juego social inspirado en el modo impostor. Un host crea una sala para una categoria, los jugadores entran con un PIN y el host inicia la partida. El servidor elige un personaje: los jugadores normales lo reciben y un impostor elegido al azar no lo ve.

## Estado Actual

- Express expone categorias y personajes por HTTP.
- Socket.IO mantiene salas y asigna el personaje/rol en tiempo real.
- PostgreSQL persiste solamente categorias y personajes mediante Sequelize.
- AdminJS administra esos mismos dos modelos en `/admin`.
- Las salas y partidas no se persisten: reiniciar el proceso elimina PINs, jugadores y partidas activas.
- No estan implementados en el runtime actual usuarios, autenticacion de jugadores, votacion, chat, rondas ni resultados, aunque aparezcan en tipos o diagramas historicos.

## Puesta En Marcha

El repositorio no fija una version de Node. La configuracion usa ESM, TypeScript 5.9 y un `package-lock.json` version 3.

```bash
npm ci
cp .env.example .env
npm run dev
```

El servidor usa `http://localhost:3000` por defecto y acepta el frontend en `http://localhost:5173`. La importacion de los modelos exige `DB_CONNECTION_STRING`, aunque la conexion se abre de forma diferida al ejecutar una consulta.

Variables:

| Variable | Uso |
| --- | --- |
| `DB_CONNECTION_STRING` | URL de PostgreSQL; obligatoria. La conexion actual fuerza SSL. |
| `PORT` | Puerto HTTP/Socket.IO; por defecto `3000`. |
| `ADMIN_EMAIL` | Usuario unico del login de AdminJS. |
| `ADMIN_HASH` | Hash bcrypt de la contrasena de AdminJS, no texto plano. |
| `COOKIE_SECRET` | Firma de la sesion de AdminJS; debe ser un secreto largo. |

No hay migraciones ni seed. El esquema debe existir antes de usar la API. No se debe usar `sequelize.sync({ alter: true })` sobre una base con datos sin una decision explicita.

## Comandos

| Comando | Resultado actual |
| --- | --- |
| `npm run dev` | Inicia nodemon con `ts-node ./src/index.ts`. |
| `npm run build` | Ejecuta `tsc`; actualmente falla por un import NodeNext sin extension y nunca emite archivos porque `noEmit` esta activo. |
| `npm start` | Intenta ejecutar `dist/index.js`; actualmente falla porque el build no genera `dist/`. |
| `npx ts-node src/db/tests/testConnection.ts` | Prueba manual de conexion; hay que leer la salida porque un error no produce exit code distinto de cero. |

No hay scripts de lint ni tests automatizados.

## HTTP

| Metodo | Ruta | Comportamiento |
| --- | --- | --- |
| `GET` | `/api/category/` | Lista `{ id, name }`; actualmente no filtra por `status`. |
| `GET` | `/api/category/:id` | Devuelve la categoria completa. |
| `POST` | `/api/category/` | Crea una categoria. |
| `PUT` | `/api/category/:id` | Actualiza una categoria. |
| `DELETE` | `/api/category/:id` | Elimina una categoria. |
| `GET` | `/api/character/` | Lista todos los personajes. |
| `GET` | `/api/character/:id` | Devuelve un personaje. |
| `GET` | `/api/character/category/:categoryId` | Lista personajes de una categoria. |
| `GET` | `/api/character/random/:categoryId` | Devuelve un personaje aleatorio de una categoria. |
| `POST` | `/api/character/` | Crea un personaje; recibe `name`, `description`, `image`, `category_id`. |
| `PUT` | `/api/character/:id` | Actualiza un personaje. |
| `DELETE` | `/api/character/:id` | Elimina un personaje. |
| `GET` | `/test` | Sirve el harness manual legado de `client/index.html`. |

Las mutaciones REST no tienen autenticacion actualmente. La autenticacion de `/admin` no se aplica a `/api/*`.

## Socket.IO

El cliente debe usar transporte WebSocket. Los callbacks son acknowledgements de Socket.IO, no eventos separados.

| Evento cliente -> servidor | Payload | Ack |
| --- | --- | --- |
| `createRoom` | `{ username: string, categoryId: string }` | `{ internalId, gamePin }` |
| `joinRoom` | `{ gamePin: number, username: string }` | `{ success, message }` |
| `startGame` | `{ gamePin: number }` | `{ success, message? }`; solo puede enviarlo el host. |

| Evento servidor -> cliente | Payload |
| --- | --- |
| `updatePlayers` | `{ players, hostId }`; hoy `players` reutiliza los objetos internos de la sala. |
| `gameStarted` | `{ categoryId, character, amIImpostor }`; se envia individualmente y `character` es `null` para el impostor. |

El payload privado de `gameStarted` es el contrato intencional. Existe un defecto conocido: si alguien entra o sale despues del inicio, `updatePlayers` puede incluir `characterId` e `isImpostor` de jugadores existentes y revelar la partida. Los clientes no deben depender de esos campos; ver `docs/TECHNICAL_DEBT.md`.

El flujo implementado termina en la asignacion inicial. No existe todavia un evento activo para finalizar o reiniciar la partida.

## Documentacion

- `AGENTS.md`: contexto operativo compacto para agentes.
- `docs/ARCHITECTURE.md`: componentes, estado y secuencia del juego actual.
- `docs/TECHNICAL_DEBT.md`: inconsistencias verificadas y mejoras propuestas, sin aplicarlas.
