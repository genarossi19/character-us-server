// CharacterResource.ts
import Character from "../../api/services/character/character.model.ts";

export const CharacterResource = {
  resource: Character,
  options: {
    listProperties: ["id", "name", "description", "image", "category_id"],
    editProperties: ["name", "description", "image", "category_id"],
    filterProperties: ["name", "category_id"],
    properties: {
      category_id: {
        reference: "category", // coincide con el resource registrado
      },
    },
  },
};
