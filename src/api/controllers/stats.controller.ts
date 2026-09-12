import type { Request, Response } from "express";
import User from "../../db/models/User.ts";
import GameHistory from "../../db/models/GameHistory.ts";
import GamePlayer from "../../db/models/GamePlayer.ts";

export async function getLeaderboard(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const sort = (req.query.sort as string) || "games_won";

    const validSorts = [
      "games_won",
      "games_played",
      "times_impostor",
      "times_eliminated",
    ];
    const sortField = validSorts.includes(sort) ? sort : "games_won";

    const users = await User.findAll({
      attributes: [
        "id",
        "username",
        "games_played",
        "games_won",
        "times_impostor",
        "times_eliminated",
      ],
      order: [[sortField, "DESC"]],
      limit,
    });

    res.json(users);
  } catch (error) {
    console.error("Error al obtener leaderboard:", error);
    res.status(500).json({ message: "No pudimos cargar el ranking. Intenta nuevamente." });
  }
}

export async function getUserStats(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: [
        "id",
        "username",
        "games_played",
        "games_won",
        "times_impostor",
        "times_eliminated",
        "created_at",
      ],
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const recentGames = await GamePlayer.findAll({
      where: { user_id: id },
      include: [{ model: GameHistory, as: "game" }],
      order: [["created_at", "DESC"]],
      limit: 10,
    });

    res.json({ user, recentGames });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({ message: "No pudimos cargar las estadísticas. Intenta nuevamente." });
  }
}
