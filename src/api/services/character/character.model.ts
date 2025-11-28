import { DataTypes, Model } from "sequelize";
import sequelize from "../../../db/sequelize.ts";
import Category from "../category/category.model.ts";
import type { CharacterType } from "../../../types/Character.ts";

const Character = sequelize.define<
  Model<CharacterType, Omit<CharacterType, "id">>
>(
  "Character",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: "character",
    timestamps: false,
  }
);

// Relación: un Character pertenece a una Category
Character.belongsTo(Category, { foreignKey: "category_id" });

Category.hasMany(Character, { foreignKey: "category_id" });

export default Character;
