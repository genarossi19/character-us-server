import type {
  RoomSettings,
  PlayerPublic,
  RoundResult,
  GameResult,
  CharacterAssignment,
  ChatMessage,
  GamePhase,
  WordHint,
} from "./Game.ts";

export interface CreateRoomPayload {
  username: string;
  settings: RoomSettings;
  avatarUrl?: string;
  token: string;
}

export interface RoomSession {
  roomId: string;
  playerId: string;
  resumeToken: string;
}

export interface ResumeRoomPayload { roomId: string; resumeToken: string }
export type RoomSnapshot = ReturnType<typeof import("../sockets/services/session.service.ts").getGameSnapshot>;

export interface JoinRoomPayload {
  code: number;
  username: string;
  /** JWT opcional. Sin él, el servidor une al jugador como invitado. */
  token?: string;
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

export interface DebateReadyPayload {
  roomId: string;
}

export interface ChangeAvatarPayload {
  avatarId: string;           // "avatar-1" .. "avatar-8"
}

export interface RenewRoomInactivityPayload {
  roomId: string;
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
  createRoom: (payload: CreateRoomPayload, ack: Ack<{ room: RoomPublic; session: RoomSession }>) => void;
  joinRoom: (payload: JoinRoomPayload, ack: Ack<{ room: RoomPublic; session: RoomSession }>) => void;
  resumeRoom: (payload: ResumeRoomPayload, ack: Ack<RoomSnapshot>) => void;
  getGameState: (payload: { roomId: string }, ack: Ack<RoomSnapshot>) => void;
  leaveRoom: (payload: LeaveRoomPayload, ack: Ack) => void;
  startGame: (payload: StartGamePayload, ack: Ack<{ room: RoomPublic }>) => void;
  kickPlayer: (payload: KickPlayerPayload, ack: Ack) => void;
  submitWord: (payload: SubmitWordPayload, ack: Ack) => void;
  votePlayer: (payload: VotePlayerPayload, ack: Ack) => void;
  sendChatMessage: (payload: SendChatMessagePayload, ack: Ack) => void;
  debateReady: (payload: DebateReadyPayload, ack: Ack) => void;
  changeAvatar: (payload: ChangeAvatarPayload, ack: Ack) => void;
  renewRoomInactivity: (
    payload: RenewRoomInactivityPayload,
    ack: Ack<{ expiresAt: number }>
  ) => void;
}

export interface ServerToClientEvents {
  actionError: (data: AckError & { event: string }) => void;
  roomUpdated: (room: RoomPublic) => void;
  playerJoined: (player: PlayerPublic) => void;
  playerLeft: (playerId: string) => void;
  playerKicked: (playerId: string) => void;
  roomClosed: (data: { reason: string }) => void;
  roomInactivityWarning: (data: {
    roomId: string;
    expiresAt: number;
    remainingMs: number;
  }) => void;
  roomInactivityRenewed: (data: { roomId: string; expiresAt: number }) => void;
  gameStarted: (data: { room: RoomPublic; totalRounds: number }) => void;
  characterAssigned: (data: CharacterAssignment) => void;
  phaseChanged: (data: { phase: GamePhase; data?: Record<string, unknown> }) => void;
  turnChanged: (data: {
    playerId: string;
    username: string;
    turnIndex: number;
    total: number;
  }) => void;
  wordHintRevealed: (data: { playerId: string; username: string; word: string; skipped: boolean }) => void;
  allWordsSubmitted: (data: { hints: WordHint[] }) => void;
  debateReadyUpdate: (data: { readyPlayers: string[]; total: number }) => void;
  voteUpdate: (data: {
    votes: Record<string, string>;
    voterId: string;
    targetId?: string;
    visible: boolean;
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
  inactivityExpiresAt: number | null;
}
