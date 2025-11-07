import type { UserResponse } from "./User";

export interface PlayerGameType {
  id: string;
  user_id: string;
  game_id: string;
  role: "impostor" | "innocent";
  final_state?: "alive" | "eliminated" | null;
  elimination_order?: number | null;
  joined_at: string;
  left_at?: string | null;
}

export type PlayerGameResponse = Omit<PlayerGameType, "user_id" | "game_id"> & {
  user: UserResponse;
};
