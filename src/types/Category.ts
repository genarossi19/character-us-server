export interface CategoryType {
  id: string;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
}

// DTO
export type CategoryDTO = {
  id: string;
  name: string;
};
