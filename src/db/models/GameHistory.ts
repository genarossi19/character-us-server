import { DataTypes, Model } from "sequelize";
import sequelize from "../sequelize.ts";

export interface GameHistoryType {
  id: string;
  room_id: string;
  category: string;
  winner: "crew" | "impostor";
  total_rounds: number;
  player_count: number;
  impostor_count: number;
  settings: Record<string, unknown>;
}

const GameHistory = sequelize.define<
  Model<GameHistoryType, Omit<GameHistoryType, "id">>
>(
  "GameHistory",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    room_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    winner: {
      type: DataTypes.ENUM("crew", "impostor"),
      allowNull: false,
    },
    total_rounds: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    player_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    impostor_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
  },
  {
    tableName: "game_history",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default GameHistory;
