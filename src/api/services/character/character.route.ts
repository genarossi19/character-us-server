import { Router } from "express";
import {
  getAllCharacters,
  getCharacterById,
  getCharactersByCategory,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  getRandomCharacter,
} from "../character/character.controller.ts";

const router = Router();

// Obtener todos los personajes
router.get("/", getAllCharacters);

// Obtener personaje por ID
router.get("/:id", getCharacterById);

// Obtener personajes por category_id
router.get("/category/:categoryId", getCharactersByCategory);

// Crear nuevo personaje
router.post("/", createCharacter);

// Actualizar personaje existente
router.put("/:id", updateCharacter);

// Eliminar personaje
router.delete("/:id", deleteCharacter);

// Endpoint para probar personaje aleatorio por categoría
router.get("/random/:categoryId", getRandomCharacter);

export default router;
