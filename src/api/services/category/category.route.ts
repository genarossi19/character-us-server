import { Router } from "express";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../category/category.controller.ts";

const router = Router();

// GET /api/category/         -> obtener todas las categorías
router.get("/", getAllCategories);

// GET /api/category/:id      -> obtener categoría por ID
router.get("/:id", getCategoryById);

// POST /api/category/        -> crear nueva categoría
router.post("/", createCategory);

// PUT /api/category/:id      -> actualizar categoría existente
router.put("/:id", updateCategory);

// DELETE /api/category/:id   -> eliminar categoría
router.delete("/:id", deleteCategory);

export default router;
