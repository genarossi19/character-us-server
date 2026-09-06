import Character from "../../db/models/Character.ts";

export const CharacterResource = {
  resource: Character,
  options: {
    listProperties: ["id", "name", "description", "imageUrl", "category_id"],
    editProperties: ["name", "description", "imageUrl", "category_id"],
    filterProperties: ["name", "category_id"],
    properties: {
      category_id: {
        reference: "category",
      },
    },
  },
};
