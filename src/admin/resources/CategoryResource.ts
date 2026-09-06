import Category from "../../db/models/Category.ts";

export const CategoryResource = {
  resource: Category,
  options: {
    listProperties: ["id", "name", "description", "status"],
    editProperties: ["name", "description", "status"],
    filterProperties: ["name", "status"],
    showProperties: ["id", "name", "description", "status"],
    properties: {
      status: {
        availableValues: [
          { value: "active", label: "Activo" },
          { value: "inactive", label: "Inactivo" },
        ],
      },
    },
  },
};
