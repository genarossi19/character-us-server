import { Router } from "express";
import {
  getAllCharacters,
  getCharacterById,
  getCharactersByCategory,
  getRandomCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "../controllers/character.controller.ts";
import { authenticateAdmin } from "../middleware/auth.ts";

const router = Router();

router.get("/", getAllCharacters);
router.get("/random/:categoryId", getRandomCharacter);
router.get("/category/:categoryId", getCharactersByCategory);
router.get("/:id", getCharacterById);
router.post("/", authenticateAdmin, createCharacter);
router.put("/:id", authenticateAdmin, updateCharacter);
router.delete("/:id", authenticateAdmin, deleteCharacter);

export default router;
