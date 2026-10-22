import type { Server as SocketIOServer, Socket } from "socket.io";
import { onAction } from "./action.ts";
import type {
  SubmitWordPayload,
  VotePlayerPayload,
  SendChatMessagePayload,
  DebateReadyPayload,
} from "../../types/socket.ts";
import { getRoom } from "../services/room.service.ts";
import { GAME_CONFIG } from "../../config/game.ts";
import { getPlayerId } from "../services/session.service.ts";
import { submitWord, castVote, sendChatMessage, setDebateReady } from "../services/game.service.ts";

export function registerGameHandlers(io: SocketIOServer, socket: Socket): void {
  onAction(socket, "submitWord", (payload: SubmitWordPayload, callback) => {
    // Algunos clientes emiten sin ack. La ausencia del callback nunca debe
    // interrumpir el proceso después de guardar y difundir una palabra.
    const ack = typeof callback === "function" ? callback : () => {};
    try {
      if (!payload || typeof payload.roomId !== "string") {
        return ack({
          success: false,
          message: "La sala es requerida",
          code: "INVALID_PAYLOAD",
        });
      }

      if (typeof payload.word !== "string" || !payload.word.trim() ||
          payload.word.trim().length > GAME_CONFIG.WORD.MAX_LENGTH) {
        return ack({
          success: false,
          message: `La palabra debe tener entre 1 y ${GAME_CONFIG.WORD.MAX_LENGTH} caracteres`,
          code: "INVALID_WORD",
        });
      }

      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = submitWord(io, room, getPlayerId(socket), payload.word);

      if (!result.success) {
        const codeMap: Record<string, string> = {
          "No es la fase de palabras": "INVALID_PHASE",
          "Jugador no encontrado": "PLAYER_NOT_FOUND",
          "No puedes decir una palabra porque estás eliminado": "PLAYER_NOT_ALIVE",
          "Ya submitiste una palabra": "ALREADY_SUBMITTED",
          "No es tu turno": "INVALID_TURN",
          "La palabra no puede estar vacía": "INVALID_WORD",
        };
        return ack({
          success: false,
          message: result.error!,
          code: codeMap[result.error!] || "SUBMIT_ERROR",
        });
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en submitWord:", error);
      ack({
        success: false,
        message: "No pudimos enviar tu palabra. Intenta nuevamente.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  onAction(socket, "votePlayer", (payload: VotePlayerPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = castVote(io, room, getPlayerId(socket), payload.targetId);

      if (!result.success) {
        const codeMap: Record<string, string> = {
          "No es la fase de votación": "INVALID_PHASE",
          "Jugador no encontrado": "PLAYER_NOT_FOUND",
          "Jugador eliminado no puede votar": "PLAYER_NOT_ALIVE",
          "Ya votaste en esta ronda": "ALREADY_VOTED",
          "No puedes votarte a ti mismo": "CANNOT_VOTE_SELF",
          "No puedes votar a un jugador eliminado": "CANNOT_VOTE_DEAD",
        };
        return ack({
          success: false,
          message: result.error!,
          code: codeMap[result.error!] || "VOTE_ERROR",
        });
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en votePlayer:", error);
      ack({
        success: false,
        message: "No pudimos registrar tu voto. Intenta nuevamente.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  onAction(socket, "sendChatMessage", (payload: SendChatMessagePayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = sendChatMessage(io, room, getPlayerId(socket), payload.message);

      if (!result.success) {
        const codeMap: Record<string, string> = {
          "Jugador no encontrado": "PLAYER_NOT_FOUND",
          "El mensaje no puede estar vacío": "INVALID_MESSAGE",
          "Enviando mensajes muy rápido": "FLOOD_LIMIT",
          "No se pueden enviar mensajes en esta fase": "INVALID_PHASE",
        };
        return ack({
          success: false,
          message: result.error!,
          code: codeMap[result.error!] || "CHAT_ERROR",
        });
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en sendChatMessage:", error);
      ack({
        success: false,
        message: "No pudimos enviar tu mensaje. Intenta nuevamente.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  onAction(socket, "debateReady", (payload: DebateReadyPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = setDebateReady(io, room, getPlayerId(socket));

      if (!result.success) {
        const codeMap: Record<string, string> = {
          "No es la fase de debate": "INVALID_PHASE",
          "Jugador no encontrado": "PLAYER_NOT_FOUND",
          "Jugador eliminado no puede marcar listo": "PLAYER_NOT_ALIVE",
          "Ya marcaste listo": "ALREADY_READY",
        };
        return ack({
          success: false,
          message: result.error!,
          code: codeMap[result.error!] || "READY_ERROR",
        });
      }

      ack({ success: true });
    } catch (error) {
      console.error("Error en debateReady:", error);
      ack({
        success: false,
        message: "No pudimos marcarte como listo. Intenta nuevamente.",
        code: "INTERNAL_ERROR",
      });
    }
  });
}
