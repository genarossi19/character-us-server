import { Router } from "express";
import { getLeaderboard, getUserStats } from "../controllers/stats.controller.ts";

const router = Router();

router.get("/leaderboard", getLeaderboard);
router.get("/user/:id", getUserStats);

export default router;
