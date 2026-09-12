import { DataTypes, Model } from "sequelize";
import sequelize from "../sequelize.ts";
import Category from "./Category.ts";

export interface CharacterType {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  category_id: string;
}

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
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "image",
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

Character.belongsTo(Category, { foreignKey: "category_id" });
Category.hasMany(Character, { foreignKey: "category_id" });

export default Character;
