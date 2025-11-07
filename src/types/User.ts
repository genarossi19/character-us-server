export interface UserType {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  avatar?: string | null;
  registered_at: string;
  role: "player" | "admin";
}

export type UserResponse = Omit<UserType, "password">;
