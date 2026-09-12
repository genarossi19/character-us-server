export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "CharacterUs API",
    version: "1.0.0",
    description:
      "Documentacion rapida de la API HTTP. Para eventos Socket.IO, acknowledgements y flujo de juego, ver /docs/socket. AsyncAPI queda reservado como futura extension.",
  },
  servers: [{ url: "/", description: "Servidor actual" }],
  externalDocs: {
    description: "Contrato completo de Socket.IO",
    url: "/docs/socket",
  },
  tags: [
    { name: "Auth", description: "Registro, sesion JWT y perfil actual" },
    { name: "Categories", description: "Catalogo de categorias" },
    { name: "Characters", description: "Catalogo de personajes" },
    { name: "Stats", description: "Estadisticas y ranking" },
  ],
  paths: {
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Registrar usuario e iniciar sesion",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SignupRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Usuario creado", content: jsonSchema("AuthResponse") },
          "400": { description: "Campos invalidos", content: jsonSchema("ValidationError") },
          "409": { description: "Email o username ya registrado", content: jsonSchema("Error") },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesion",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } },
          },
        },
        responses: {
          "200": { description: "Sesion creada", content: jsonSchema("AuthResponse") },
          "400": { description: "Campos invalidos", content: jsonSchema("ValidationError") },
          "401": { description: "Credenciales invalidas", content: jsonSchema("Error") },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Obtener perfil actual",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Perfil actualizado", content: jsonSchema("CurrentUserResponse") },
          "401": { description: "Token ausente o usuario inexistente", content: jsonSchema("Error") },
          "403": { description: "Token invalido o expirado", content: jsonSchema("Error") },
        },
      },
    },
    "/api/category": {
      get: {
        tags: ["Categories"],
        summary: "Listar categorias",
        responses: {
          "200": {
            description: "Categorias disponibles",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/CategoryListItem" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Categories"],
        summary: "Crear categoria (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CategoryWrite" } },
          },
        },
        responses: {
          "201": { description: "Categoria creada", content: jsonSchema("Category") },
          "400": { description: "Nombre requerido", content: jsonSchema("Error") },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
        },
      },
    },
    "/api/category/{id}": {
      parameters: [uuidParameter("id", "ID de categoria")],
      get: {
        tags: ["Categories"],
        summary: "Obtener categoria por ID",
        responses: {
          "200": { description: "Categoria", content: jsonSchema("Category") },
          "404": { description: "Categoria no encontrada", content: jsonSchema("Error") },
        },
      },
      put: {
        tags: ["Categories"],
        summary: "Actualizar categoria (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CategoryWrite" } },
          },
        },
        responses: {
          "200": { description: "Categoria actualizada", content: jsonSchema("Category") },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
          "404": { description: "Categoria no encontrada", content: jsonSchema("Error") },
        },
      },
      delete: {
        tags: ["Categories"],
        summary: "Eliminar categoria (admin)",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "Categoria eliminada" },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
          "404": { description: "Categoria no encontrada", content: jsonSchema("Error") },
        },
      },
    },
    "/api/character": {
      get: {
        tags: ["Characters"],
        summary: "Listar personajes",
        responses: {
          "200": {
            description: "Personajes",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Character" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Characters"],
        summary: "Crear personaje (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CharacterWrite" } },
          },
        },
        responses: {
          "201": { description: "Personaje creado", content: jsonSchema("Character") },
          "400": { description: "Nombre y category_id requeridos", content: jsonSchema("Error") },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
        },
      },
    },
    "/api/character/{id}": {
      parameters: [uuidParameter("id", "ID de personaje")],
      get: {
        tags: ["Characters"],
        summary: "Obtener personaje por ID",
        responses: {
          "200": { description: "Personaje", content: jsonSchema("Character") },
          "404": { description: "Personaje no encontrado", content: jsonSchema("Error") },
        },
      },
      put: {
        tags: ["Characters"],
        summary: "Actualizar personaje (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CharacterWrite" } },
          },
        },
        responses: {
          "200": { description: "Personaje actualizado", content: jsonSchema("Character") },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
          "404": { description: "Personaje no encontrado", content: jsonSchema("Error") },
        },
      },
      delete: {
        tags: ["Characters"],
        summary: "Eliminar personaje (admin)",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "Personaje eliminado" },
          "401": { description: "Token requerido", content: jsonSchema("Error") },
          "403": { description: "No es administrador", content: jsonSchema("Error") },
          "404": { description: "Personaje no encontrado", content: jsonSchema("Error") },
        },
      },
    },
    "/api/character/category/{categoryId}": {
      parameters: [uuidParameter("categoryId", "ID de categoria")],
      get: {
        tags: ["Characters"],
        summary: "Listar personajes de una categoria",
        responses: {
          "200": {
            description: "Personajes de la categoria",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Character" } },
              },
            },
          },
        },
      },
    },
    "/api/character/random/{categoryId}": {
      parameters: [uuidParameter("categoryId", "ID de categoria")],
      get: {
        tags: ["Characters"],
        summary: "Obtener personaje aleatorio de una categoria",
        responses: {
          "200": { description: "Personaje", content: jsonSchema("Character") },
          "404": { description: "No hay personajes para la categoria", content: jsonSchema("Error") },
        },
      },
    },
    "/api/stats/leaderboard": {
      get: {
        tags: ["Stats"],
        summary: "Obtener ranking de usuarios",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
          {
            name: "sort",
            in: "query",
            schema: {
              type: "string",
              enum: ["games_won", "games_played", "times_impostor", "times_eliminated"],
              default: "games_won",
            },
          },
        ],
        responses: {
          "200": {
            description: "Ranking",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/UserStats" } },
              },
            },
          },
        },
      },
    },
    "/api/stats/user/{id}": {
      parameters: [uuidParameter("id", "ID de usuario")],
      get: {
        tags: ["Stats"],
        summary: "Obtener estadisticas y partidas recientes de un usuario",
        responses: {
          "200": { description: "Estadisticas", content: jsonSchema("UserStatsResponse") },
          "404": { description: "Usuario no encontrado", content: jsonSchema("Error") },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Token obtenido de /api/auth/signup o /api/auth/login.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      ValidationError: {
        allOf: [
          { $ref: "#/components/schemas/Error" },
          {
            type: "object",
            properties: {
              errors: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
            },
          },
        ],
      },
      SignupRequest: {
        type: "object",
        required: ["username", "email", "password", "confirmPassword"],
        properties: {
          username: { type: "string", minLength: 3, maxLength: 30, pattern: "^[a-zA-Z0-9_]+$", example: "character_player" },
          email: { type: "string", format: "email", example: "player@example.com" },
          password: { type: "string", format: "password", minLength: 8, maxLength: 72 },
          confirmPassword: { type: "string", format: "password", minLength: 8, maxLength: 72 },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "player@example.com" },
          password: { type: "string", format: "password" },
        },
      },
      AuthUser: {
        type: "object",
        required: ["id", "username", "email", "gamesPlayed", "gamesWon", "timesImpostor", "timesEliminated", "isGuest"],
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
          gamesPlayed: { type: "integer", minimum: 0 },
          gamesWon: { type: "integer", minimum: 0 },
          timesImpostor: { type: "integer", minimum: 0 },
          timesEliminated: { type: "integer", minimum: 0 },
          isGuest: { type: "boolean", example: false },
        },
      },
      AuthResponse: {
        type: "object",
        required: ["user", "token", "tokenType", "expiresIn"],
        properties: {
          user: { $ref: "#/components/schemas/AuthUser" },
          token: { type: "string", description: "JWT de acceso" },
          tokenType: { type: "string", enum: ["Bearer"] },
          expiresIn: { type: "integer", example: 3600 },
        },
      },
      CurrentUserResponse: {
        type: "object",
        required: ["user"],
        properties: { user: { $ref: "#/components/schemas/AuthUser" } },
      },
      CategoryListItem: {
        type: "object",
        required: ["id", "name"],
        properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
      },
      Category: {
        type: "object",
        required: ["id", "name", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          status: { type: "string", enum: ["active", "inactive"] },
        },
      },
      CategoryWrite: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
        },
      },
      Character: {
        type: "object",
        required: ["id", "name", "category_id"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          imageUrl: { type: ["string", "null"], format: "uri" },
          category_id: { type: "string", format: "uuid" },
        },
      },
      CharacterWrite: {
        type: "object",
        required: ["name", "category_id"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          imageUrl: { type: "string", format: "uri", description: "Se persiste en la columna image (TEXT)." },
          category_id: { type: "string", format: "uuid" },
        },
      },
      UserStats: {
        type: "object",
        required: ["id", "username", "games_played", "games_won", "times_impostor", "times_eliminated"],
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
          games_played: { type: "integer", minimum: 0 },
          games_won: { type: "integer", minimum: 0 },
          times_impostor: { type: "integer", minimum: 0 },
          times_eliminated: { type: "integer", minimum: 0 },
        },
      },
      UserStatsResponse: {
        type: "object",
        required: ["user", "recentGames"],
        properties: {
          user: { $ref: "#/components/schemas/UserStats" },
          recentGames: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
    },
  },
} as const;

function jsonSchema(name: string) {
  return {
    "application/json": {
      schema: { $ref: `#/components/schemas/${name}` },
    },
  };
}

function uuidParameter(name: string, description: string) {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", format: "uuid" },
  };
}
