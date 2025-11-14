import AdminJS from "adminjs";
import type { ActionRequest, ActionContext } from "adminjs";
import type { Response } from "express";
import sequelize from "../db/sequelize.ts";
import AdminJSSequelize from "@adminjs/sequelize";
// Importa tus modelos
import Category from "../api/services/category/category.model.ts";

// Registra el adaptador Sequelize
AdminJS.registerAdapter(AdminJSSequelize);

const adminJs = new AdminJS({
  databases: [sequelize],
  rootPath: "/admin",
  resources: [
    {
      resource: Category,
      options: {
        listProperties: ["id", "name", "description", "status"],
        editProperties: ["name", "description", "status"],
        filterProperties: ["name", "status"],
        properties: {
          status: {
            availableValues: [{ value: "active" }, { value: "inactive" }],
          },
        },
      },
    },
  ],
});

export default adminJs;
