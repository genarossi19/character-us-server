import Character from "../../../db/models/Character.ts";
import type { CharacterType } from "../../../db/models/Character.ts";

export const getRandomCharacterByCategory = async (
  categoryId: string
): Promise<CharacterType | null> => {
  const characters = await Character.findAll({
    where: { category_id: categoryId },
    raw: true,
  });

  if (!characters || characters.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * characters.length);
  return characters[randomIndex] as unknown as CharacterType;
};

export async function getCharactersByCategory(
  categoryId: string
): Promise<CharacterType[]> {
  const characters = await Character.findAll({
    where: { category_id: categoryId },
    raw: true,
  });

  return characters as unknown as CharacterType[];
}
