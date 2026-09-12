import type { Server as SocketIOServer, Socket } from "socket.io";
import type {
  SubmitWordPayload,
  VotePlayerPayload,
  SendChatMessagePayload,
  DebateReadyPayload,
} from "../../types/socket.ts";
import { getRoom } from "../services/room.service.ts";
import { submitWord, castVote, sendChatMessage, setDebateReady } from "../services/game.service.ts";

export function registerGameHandlers(io: SocketIOServer, socket: Socket): void {
  socket.on("submitWord", (payload: SubmitWordPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = submitWord(io, room, socket.id, payload.word);

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

  socket.on("votePlayer", (payload: VotePlayerPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = castVote(io, room, socket.id, payload.targetId);

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

  socket.on("sendChatMessage", (payload: SendChatMessagePayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = sendChatMessage(io, room, socket.id, payload.message);

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

  socket.on("debateReady", (payload: DebateReadyPayload, ack) => {
    try {
      const room = getRoom(payload.roomId);
      if (!room) {
        return ack({
          success: false,
          message: "Sala no encontrada",
          code: "ROOM_NOT_FOUND",
        });
      }

      const result = setDebateReady(io, room, socket.id);

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
