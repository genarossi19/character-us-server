import type {
  RoomSettings,
  PlayerPublic,
  RoundResult,
  GameResult,
  CharacterAssignment,
  ChatMessage,
  GamePhase,
} from "./game.ts";

export interface CreateRoomPayload {
  username: string;
  settings: RoomSettings;
  avatarUrl?: string;
}

export interface JoinRoomPayload {
  code: number;
  username: string;
  isGuest: boolean;
  avatarUrl?: string;
  userId?: string;
  password?: string;
}

export interface StartGamePayload {
  roomId: string;
}

export interface KickPlayerPayload {
  roomId: string;
  targetId: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface SubmitWordPayload {
  roomId: string;
  word: string;
}

export interface VotePlayerPayload {
  roomId: string;
  targetId: string;
}

export interface SendChatMessagePayload {
  roomId: string;
  message: string;
}

export interface AckSuccess<T = void> {
  success: true;
  data?: T;
}

export interface AckError {
  success: false;
  message: string;
  code: string;
}

export type Ack<T = void> = (response: AckSuccess<T> | AckError) => void;

export interface SocketToServerEvents {
  createRoom: (payload: CreateRoomPayload, ack: Ack<{ room: RoomPublic }>) => void;
  joinRoom: (payload: JoinRoomPayload, ack: Ack<{ room: RoomPublic }>) => void;
  leaveRoom: (payload: LeaveRoomPayload, ack: Ack) => void;
  startGame: (payload: StartGamePayload, ack: Ack<{ room: RoomPublic }>) => void;
  kickPlayer: (payload: KickPlayerPayload, ack: Ack) => void;
  submitWord: (payload: SubmitWordPayload, ack: Ack) => void;
  votePlayer: (payload: VotePlayerPayload, ack: Ack) => void;
  sendChatMessage: (payload: SendChatMessagePayload, ack: Ack) => void;
}

export interface ServerToClientEvents {
  roomUpdated: (room: RoomPublic) => void;
  playerJoined: (player: PlayerPublic) => void;
  playerLeft: (playerId: string) => void;
  playerKicked: (playerId: string) => void;
  roomClosed: (data: { reason: string }) => void;
  gameStarted: (data: { room: RoomPublic; totalRounds: number }) => void;
  characterAssigned: (data: CharacterAssignment) => void;
  phaseChanged: (data: { phase: GamePhase; data?: Record<string, unknown> }) => void;
  turnChanged: (data: {
    playerId: string;
    username: string;
    turnIndex: number;
    total: number;
  }) => void;
  wordHintRevealed: (data: { playerId: string; username: string }) => void;
  allWordsSubmitted: (data: { hints: { playerId: string; username: string; word: string; revealed: boolean }[] }) => void;
  voteUpdate: (data: {
    votes: Record<string, string>;
    voterId: string;
    targetId: string;
  }) => void;
  playerEliminated: (data: { player: PlayerPublic; wasImpostor: boolean }) => void;
  roundResults: (result: RoundResult) => void;
  gameEnded: (result: GameResult) => void;
  chatMessage: (message: ChatMessage) => void;
  reconnectTimeout: (data: { playerId: string; secondsLeft: number }) => void;
}

export interface RoomPublic {
  id: string;
  code: number;
  hostId: string;
  name: string;
  settings: RoomSettings;
  players: PlayerPublic[];
  status: "waiting" | "playing" | "finished";
  gamePhase: GamePhase;
  currentRound: number;
}
