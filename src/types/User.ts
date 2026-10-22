export interface UserType {
  id: string;
  username: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  games_played: number;
  games_won: number;
  times_impostor: number;
  times_eliminated: number;
  created_at: string;
  updated_at: string;
}

export type UserResponse = Omit<UserType, "password_hash" | "google_sub">;

export type UserGameResponse = Omit<
  UserType,
  "password_hash" | "google_sub" | "email" | "created_at" | "updated_at"
>;
