import AdminJS from "adminjs";
import sequelize from "../db/sequelize.ts";
import AdminJSSequelize from "@adminjs/sequelize";
// Importa tus modelos
import { CharacterResource } from "./resources/CharacterResource.ts";
import { CategoryResource } from "./resources/CategoryResource.ts";
// Registra el adaptador Sequelize
AdminJS.registerAdapter(AdminJSSequelize);

const adminJs = new AdminJS({
  databases: [sequelize],
  rootPath: "/admin",
  resources: [CategoryResource, CharacterResource],
});

export default adminJs;
