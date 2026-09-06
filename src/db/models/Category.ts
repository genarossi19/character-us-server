import { DataTypes, Model } from "sequelize";
import sequelize from "../sequelize.ts";

export interface CategoryType {
  id: string;
  name: string;
  description?: string | null;
  status: "active" | "inactive";
}

const Category = sequelize.define<
  Model<CategoryType, Omit<CategoryType, "id">>
>(
  "Category",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "category",
    timestamps: false,
  }
);

export default Category;
