export interface UserType {
  id: string;
  first_name: string;
  last_name: string;
  username: string; // nuevo
  email: string;
  password: string;
  avatar?: string | null;
  registered_at: string;
  role: "player" | "admin";
}

export type UserResponse = Omit<UserType, "password">;

export type UserGameResponse = Omit<
  UserType,
  "password" | "registered_at" | "email" | "last_name" | "first_name"
>;
