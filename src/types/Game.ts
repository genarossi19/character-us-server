export type GamePhase =
  | "waiting"
  | "character"
  | "word"
  | "debate"
  | "voting"
  | "results"
  | "finished";

export type GameMode = "classic" | "anonymous" | "special";

export type GameWinner = "innocent" | "impostor";

export interface RoomSettings {
  category: string;
  impostorCount: number;
  totalRounds: number;
  maxPlayers: number;
  privacy: "public" | "private";
  mode: GameMode;
  impostorsKnowEachOther: boolean;
  visibleVotes: boolean;
  password?: string;
}

export interface PlayerState {
  socketId: string;
  userId: string | null;
  username: string;
  avatarUrl: string;
  isHost: boolean;
  isGuest: boolean;
  isAlive: boolean;
  isOnline: boolean;
  characterId: string | null;
  isImpostor: boolean;
  isJoker: boolean;
  isDebateReady: boolean;
  hasSubmittedWord: boolean;
  word: string | null;
  hasVoted: boolean;
  votedFor: string | null;
  disconnectedAt: number | null;
}

export interface RoomState {
  id: string;
  code: number;
  hostId: string;
  name: string;
  settings: RoomSettings;
  players: Map<string, PlayerState>;
  status: "waiting" | "playing" | "finished";
  gamePhase: GamePhase;
  currentRound: number;
  turnOrder: string[];
  currentTurnIndex: number;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  debateTimer: ReturnType<typeof setTimeout> | null;
  votes: Map<string, string>;
  roundResults: RoundResult[];
  chatMessages: ChatMessage[];
}

export interface WordHint {
  playerId: string;
  username: string;
  word: string;
  revealed: boolean;
  skipped: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  type: "player" | "ghost" | "system";
  timestamp: number;
}

export interface RoundResult {
  round: number;
  eliminatedPlayer: PlayerPublic | null;
  wasImpostor: boolean;
  wasJoker: boolean;
  votes: Record<string, string>;
  wordHints: WordHint[];
}

export interface GameResult {
  winner: GameWinner;
  rounds: RoundResult[];
  players: PlayerPublic[];
}

export interface PlayerPublic {
  socketId: string;
  userId: string | null;
  username: string;
  avatarUrl: string;
  isHost: boolean;
  isGuest: boolean;
  isAlive: boolean;
  isOnline: boolean;
  hasVoted: boolean;
  isDebateReady: boolean;
}

export interface CharacterAssignment {
  character: {
    id: string;
    name: string | null;
    imageUrl: string | null;
    category: string;
  } | null;
  isImpostor: boolean;
  impostorIds?: string[];
}
