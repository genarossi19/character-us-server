import { Router } from "express";
import { signup, login, googleLogin, getCurrentUser } from "../controllers/auth.controller.ts";
import { authenticateToken } from "../middleware/auth.ts";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", authenticateToken, getCurrentUser);

export default router;
