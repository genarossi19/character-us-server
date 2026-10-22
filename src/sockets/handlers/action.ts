import type { Socket } from "socket.io";
import type { Ack } from "../../types/socket.ts";

/** Único borde de entrada para acciones: valida y contiene errores sync/async. */
export function onAction(
  socket: Socket,
  event: string,
  handler: (payload: any, ack: Ack<any>) => unknown,
): void {
  socket.on(event, (payload: unknown, callback: unknown) => {
    let replied = false;
    const ack: Ack<any> = (response) => {
      if (replied) return;
      replied = true;
      if (typeof callback === "function") callback(response);
      else if (!response.success) socket.emit("actionError", { event, ...response });
    };
    const fail = (code: string, message: string) => ack({ success: false, code, message });
    const internalError = () => fail("INTERNAL_ERROR", "No pudimos completar la acción. Intenta nuevamente.");
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return fail("INVALID_PAYLOAD", "La solicitud debe ser un objeto válido");
      }
      const input = payload as Record<string, unknown>;
      const fields: Record<string, [string, string]> = {
        submitWord: ["word", "INVALID_WORD"],
        sendChatMessage: ["message", "INVALID_MESSAGE"],
        votePlayer: ["targetId", "INVALID_PAYLOAD"],
        changeAvatar: ["avatarId", "INVALID_AVATAR"],
        kickPlayer: ["targetId", "INVALID_PAYLOAD"],
      };
      const field = fields[event];
      if (field && (typeof input[field[0]] !== "string" || !(input[field[0]] as string).trim())) {
        return fail(field[1], `El campo ${field[0]} es requerido y debe ser texto`);
      }
      if (!["createRoom", "joinRoom", "changeAvatar", "resumeRoom"].includes(event) &&
          (typeof input.roomId !== "string" || !input.roomId)) {
        return fail("INVALID_PAYLOAD", "La sala es requerida");
      }
      // Promise.resolve también contiene handlers que consultan la base de datos.
      const result = handler(payload, ack);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return Promise.resolve(result).catch(internalError);
      }
    } catch {
      internalError();
    }
  });
}
