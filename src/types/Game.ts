import type { CategoryResponse } from "./Category";
import type { CharacterResponse } from "./Character";
import type { PlayerGameResponse } from "./PlayerGame";
import type { UserGameResponse } from "./User";

export interface GameType {
  id: string;
  pin_code: string;
  name?: string | null;
  category_id: string;
  character_id?: string | null;
  host_id: string;
  type: "public" | "private";
  mode: "virtual" | "in_person";
  mode_variant: "classic" | "anonymous" | "special";
  impostors_know_each_other: boolean;
  impostor_count: number;
  max_players: number;
  min_players: number;
  status: "waiting" | "in_progress" | "finished";
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  total_rounds?: number | null;
  winner?: "impostors" | "innocents" | null;
  total_players?: number | null;
  total_impostors?: number | null;
  total_eliminated?: number | null;
  total_survivors?: number | null;
  duration_seconds?: number | null;
}

export type GameResponse = Omit<
  GameType,
  "category_id" | "character_id" | "host_id"
> & {
  category: CategoryResponse;
  character?: CharacterResponse | null;
  host: UserGameResponse;
  players: PlayerGameResponse[];
};
