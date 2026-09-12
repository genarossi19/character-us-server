import { DataTypes, Model, type Optional } from "sequelize";
import sequelize from "../sequelize.ts";

export interface UserType {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  games_played: number;
  games_won: number;
  times_impostor: number;
  times_eliminated: number;
}

type UserCreationAttributes = Optional<
  UserType,
  "id" | "games_played" | "games_won" | "times_impostor" | "times_eliminated"
>;

const User = sequelize.define<Model<UserType, UserCreationAttributes>>(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    username: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    games_played: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    games_won: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    times_impostor: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    times_eliminated: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default User;
