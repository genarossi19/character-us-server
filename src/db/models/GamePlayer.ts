import { DataTypes, Model } from "sequelize";
import sequelize from "../sequelize.ts";
import GameHistory from "./GameHistory.ts";
import User from "./User.ts";

export interface GamePlayerType {
  id: string;
  game_id: string;
  user_id: string | null;
  player_name: string;
  was_impostor: boolean;
  was_eliminated: boolean;
  survived: boolean;
  eliminated_round: number | null;
}

const GamePlayer = sequelize.define<
  Model<GamePlayerType, Omit<GamePlayerType, "id">>
>(
  "GamePlayer",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    game_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    player_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    was_impostor: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    was_eliminated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    survived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    eliminated_round: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "game_players",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

GamePlayer.belongsTo(GameHistory, { foreignKey: "game_id", as: "game" });
GameHistory.hasMany(GamePlayer, { foreignKey: "game_id", as: "players" });

GamePlayer.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(GamePlayer, { foreignKey: "user_id", as: "gamePlayers" });

export default GamePlayer;
