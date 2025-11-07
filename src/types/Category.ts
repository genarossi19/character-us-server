export interface CategoryType {
  id: string;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
}

export type CategoryResponse = CategoryType;
