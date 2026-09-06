# Revision Tecnica

Hallazgos verificados contra el codigo actual. Son propuestas para planificar; no se aplicaron cambios funcionales durante esta revision.

## Prioridad Alta

### Build Y Arranque De Produccion Incompatibles

Evidencia:

- `npm run build` falla en `src/types/PlayerGame.ts` porque `./User` no incluye extension bajo `moduleResolution: NodeNext`.
- `tsconfig.json` combina imports `.ts`, `allowImportingTsExtensions` y `noEmit: true`.
- `npm start` exige `dist/index.js`, que no existe y no puede producir el build actual.

Propuesta: elegir una sola estrategia. Para compilar a Node ESM, usar specifiers `.js` en el TypeScript fuente, desactivar `allowImportingTsExtensions`/`noEmit` y verificar el `dist`. Alternativamente, declarar que produccion ejecuta TypeScript con un loader compatible y alinear `start`; no basta con quitar `noEmit`, porque los imports `.ts` emitidos seguirian apuntando a archivos inexistentes en `dist`.

### Escrituras REST Sin Autorizacion

`POST`, `PUT` y `DELETE` de categorias/personajes son publicos. El login de AdminJS solo protege `/admin` y no esos routers.

Propuesta: decidir si REST es lectura publica y reservar mutaciones a AdminJS, o aplicar el mismo limite de confianza a las rutas de escritura. Evitar asumir que el panel autentica globalmente.

### Configuracion De Sesion Insegura Por Defecto

`admin.router.ts` usa `"un-secreto-corto"` cuando falta `COOKIE_SECRET`; `ADMIN_EMAIL` y `ADMIN_HASH` tampoco se validan al arrancar.

Propuesta: fallar al inicio cuando falten secretos de administracion y definir atributos de cookie apropiados al entorno. No mantener un secreto conocido como fallback fuera de desarrollo explicito.

### Integridad Del Lobby En Desconexion

En `rooms.ts`:

- Se emite `updatePlayers` con el host anterior y solo despues se transfiere `hostId`, dejando a los clientes con un host obsoleto.
- Al borrar una sala no se elimina `pinMap[gamePin]`; crece el mapa y el PIN queda reservado para siempre durante la vida del proceso.
- Un socket puede crear/unirse a varias salas, pero la desconexion limpia solo la primera coincidencia por el `break`.

Propuesta: centralizar alta/baja de membresia y eliminacion de sala en operaciones atomicas; actualizar host y mapas antes de emitir el estado final. Definir si una conexion puede pertenecer a una o varias salas y hacerlo cumplir.

### Fuga Del Personaje Y Rol Por `updatePlayers`

`startGame` agrega `characterId` e `isImpostor` a cada objeto de `room.players`. Tanto `joinRoom` como `disconnect` emiten despues el array completo mediante `updatePlayers`. Si cualquiera de esos eventos ocurre tras el inicio, todos reciben el indice de impostor y el UUID del personaje; ese UUID puede resolverse con el endpoint REST publico.

Propuesta: construir un DTO publico de jugador que solo contenga los campos de lobby permitidos y mantener rol/personaje en estado privado. Rechazar entradas cuando la partida ya comenzo tambien reduce transiciones invalidas, pero no sustituye la separacion de datos.

## Prioridad Media

### Entradas Y Transiciones Sin Validacion

Los payloads Socket.IO no tienen validacion en runtime. Se aceptan nombres/categorias ausentes, membresias duplicadas y nuevos jugadores despues de `gameStarted`. Tambien se puede iniciar con un solo jugador, que necesariamente sera impostor y no recibira personaje.

Propuesta: validar esquemas y precondiciones en el borde, devolver siempre acknowledgements con una forma consistente y fijar el minimo de jugadores que ya aparece conceptualmente en `GameType`.

### Categoria Activa No Afecta Al Juego

`Category.status` existe y AdminJS permite desactivar categorias, pero `GET /api/category/` lista todas y `getRandomCharacterByCategory` selecciona por ID sin comprobar estado. Una categoria inactiva sigue siendo jugable si el cliente conserva el UUID.

Propuesta: definir `inactive` como regla efectiva de lectura/creacion de sala o eliminar el campo si no tiene semantica. La primera opcion parece coherente con el panel actual, pero requiere confirmar el contrato del frontend.

### Ciclo De Vida De Base De Datos No Administrado

El servidor no ejecuta `authenticate`, migraciones ni sincronizacion. El unico script que sincroniza usa `sequelize.sync({ alter: true })`, no esta en `package.json` y puede mutar una base real. SSL se fuerza incluso para entornos locales.

Propuesta: separar configuracion por entorno, agregar una comprobacion de disponibilidad al arranque y adoptar migraciones antes de evolucionar modelos. Mantener `sync({ alter: true })` fuera del startup y de bases compartidas.

### Contratos Y Artefactos Obsoletos

- `src/sockets/game.ts` duplica parcialmente el lobby pero no se importa.
- `client/index.html` espera `gameStarted.players`, mientras el servidor envia `character` y `amIImpostor`; tambien escucha `playerJoined`, que el handler activo no emite.
- El diagrama HTTP enumera endpoints de usuarios/partidas y eventos de chat/voto que no existen.
- `Game`, `User` y `PlayerGame` solo son tipos sin modelos ni rutas.

Propuesta: eliminar o archivar los artefactos cuando se confirme que no se necesitan, y mantener un unico contrato de eventos compartido con el frontend. Hasta entonces, tratarlos como legado y no como especificacion.

### Logging Poco Util Y Con Datos Del Juego

Morgan se registra despues de las rutas y no observa normalmente las respuestas ya resueltas. Sequelize recibe `logging: true`, que genera una advertencia de deprecacion, y servicio/socket imprimen consultas, objetos completos e indice del impostor.

Propuesta: montar Morgan antes de rutas, configurar Sequelize con funcion o `false`, y usar logs estructurados por entorno sin revelar personaje/rol ni volcar todo el estado de sala.

## Prioridad Baja

### Seleccion Aleatoria Carga Toda La Categoria

Cada inicio trae todos los personajes a memoria para elegir un indice. Es correcto para catalogos pequenos, pero el costo crece linealmente.

Propuesta: medir antes de cambiar. Si el catalogo crece, seleccionar mediante una estrategia de base de datos o conteo/offset sin registrar todos los registros.

### Respuestas De Error Y Actualizaciones Parciales

Los controladores convierten restricciones/valores invalidos en `500`, y los `PUT` pasan campos posiblemente `undefined` al modelo. No hay esquema comun de validacion ni distincion consistente entre entrada invalida, conflicto y fallo interno.

Propuesta: validar DTOs antes de Sequelize y acordar si `PUT` reemplaza o si el comportamiento real debe exponerse como `PATCH`.

### Repositorio Sin Verificacion Automatizada

No hay framework de tests, lint ni CI. El script `src/db/tests/testConnection.ts` captura errores sin marcar un exit code fallido; por eso no sirve como gate automatizado.

Primeras verificaciones recomendadas, sin ampliar features:

1. Tests de handlers para autorizacion del host, secreto por jugador, reintento tras error de BD y limpieza al desconectar.
2. Tests HTTP de CRUD, validacion y categoria activa/inactiva.
3. Smoke test que construya el artefacto y arranque el entrypoint de produccion.
