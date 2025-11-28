import type { CharacterType } from "src/types/Character.ts";
import Character from "./character.model.ts";

export const getRandomCharacterByCategory = async (categoryId: string) => {
  const characters = await Character.findAll({
    where: { category_id: categoryId },
  });

  if (!characters.length) return null;

  const randomIndex = Math.floor(Math.random() * characters.length);
  return characters[randomIndex].get({ plain: true });
};

export async function getCharactersByCategory(
  categoryId: string
): Promise<CharacterType[]> {
  const characters = await Character.findAll({
    where: { category_id: categoryId },
  });
  return characters.map((c) => c.get({ plain: true }));
}
