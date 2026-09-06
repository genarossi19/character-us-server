# Repository Instructions

## Sources Of Truth

- The runtime entrypoint is `src/index.ts`; it wires Express, AdminJS, Socket.IO, and the HTTP server.
- `src/sockets/rooms.ts` is the active game handler. `src/sockets/game.ts` is an older, unreferenced implementation; do not update it as if it were active.
- `ClassDiagram.mmd` and `Mermaid Chart - Create complex, visual diagrams with text.-2025-11-19-141150.mmd` describe planned/history scope, not the current API. Verify behavior in code and `README.md`.
- `.adminjs/` is generated AdminJS output. Change `src/admin/` resources/configuration instead.

## Commands And Baseline

- Install exactly from the lockfile with `npm ci`.
- Run development with `npm run dev`; nodemon executes TypeScript directly via `ts-node` and watches `src/**/*.ts`.
- There are no lint, test, migration, or seed scripts. Files under `src/db/tests/` are standalone scripts, not an automated test suite.
- `npm run build` currently means `tsc`, but the baseline fails at `src/types/PlayerGame.ts` because its NodeNext import lacks an extension.
- Even after that type error, `tsconfig.json` has `noEmit: true`; therefore no `dist/` is produced and `npm start` currently fails. Do not claim production build/start verification until the module strategy is fixed.
- `npx ts-node src/db/tests/testConnection.ts` only probes PostgreSQL and does not return a failing exit code on connection error; inspect its output. Never use `src/db/testDbConnection.ts` casually because it runs `sequelize.sync({ alter: true })` against the configured database.

## Runtime Requirements

- Copy variable names from `.env.example`; `DB_CONNECTION_STRING` is required during module import. Admin login additionally needs a bcrypt `ADMIN_HASH` and `ADMIN_EMAIL`.
- PostgreSQL is configured with SSL required and `rejectUnauthorized: false`; local non-SSL PostgreSQL is not supported by the current configuration.
- Both Express and Socket.IO only allow `http://localhost:5173`, and Socket.IO forces WebSocket transport. Keep backend/frontend origin and transport changes coordinated.
- Port defaults to `3000`. `/test` serves a legacy browser harness whose `gameStarted` expectations no longer match the active socket payload.

## Architecture And Contracts

- PostgreSQL/Sequelize persists only `category` and `character`. Rooms, PINs, players, host ownership, selected character, and impostor role are process-local memory in `rooms.ts` and vanish on restart.
- AdminJS at `/admin` and REST under `/api/category` and `/api/character` operate on the same Sequelize models. REST mutations are currently unauthenticated; do not assume AdminJS authentication protects them.
- The active socket flow is `createRoom` -> `joinRoom` -> host-only `startGame`; exact payloads and acknowledgements are documented in `README.md`.
- One character is selected for the room and one player is chosen as impostor. `gameStarted` must remain a per-socket emission: innocents receive the character, while the impostor receives `character: null` and only each player receives their own `amIImpostor` value.
- Never expose `isImpostor` or `characterId` in room-wide lobby payloads. The current reuse of internal player objects in `updatePlayers` can leak both after game start and is tracked as high-priority debt.
- Socket/API payloads use camelCase (`gamePin`, `categoryId`); persisted columns and REST character writes use snake_case (`category_id`). Preserve this boundary unless changing frontend and DB contracts together.

## Change Guidance

- Read `docs/ARCHITECTURE.md` before changing room lifecycle, socket events, models, or server startup.
- Read `docs/TECHNICAL_DEBT.md` for verified defects and proposals. It is an audit, not authorization to bundle unrelated fixes.
- Do not introduce `sequelize.sync({ alter: true })` into normal startup; there is no migration safety net or disposable-test-database convention.
- When changing socket behavior, verify host authorization, per-player secrecy, disconnect cleanup, and acknowledgement shape. There is no automated coverage for these invariants.
