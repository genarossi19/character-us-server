export const GAME_CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,

  PHASE_DURATIONS: {
    character: 6_000,
    word: 0,
    debate: 40_000,
    voting: 40_000,
    results: 5_000,
  } as const,

  WORD_TURN_TIMEOUT: 60_000,

  RECONNECT_TIMEOUT: 60_000,

  CHAT: {
    FLOOD_LIMIT_MS: 2_000,
    MAX_MESSAGE_LENGTH: 500,
  },

  WORD: {
    MAX_LENGTH: 20,
  },

  ROOM: {
    CODE_LENGTH: 6,
    CODE_MIN: 100_000,
    CODE_MAX: 999_999,
  },

  AVATARS: [
    { id: "avatar-1", name: "Astronauta", imageUrl: "/avatars/astronaut.webp" },
    { id: "avatar-2", name: "Pirata", imageUrl: "/avatars/pirata.webp" },
    { id: "avatar-3", name: "Detective", imageUrl: "/avatars/detective.webp" },
    { id: "avatar-4", name: "Chef", imageUrl: "/avatars/chef.webp" },
    { id: "avatar-5", name: "Médico", imageUrl: "/avatars/medico.webp" },
    { id: "avatar-6", name: "Artista", imageUrl: "/avatars/artista.webp" },
    { id: "avatar-7", name: "Soldado", imageUrl: "/avatars/soldado.webp" },
    { id: "avatar-8", name: "Villano", imageUrl: "/avatars/villano.webp" },
  ],
} as const;
