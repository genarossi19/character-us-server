import type { CategoryDTO } from "./Category.ts";

export interface CharacterType {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  category_id: string;
}
export type CharacterResponse = Omit<CharacterType, "category_id"> & {
  category: CategoryDTO;
};
