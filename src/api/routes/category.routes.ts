import { Router } from "express";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller.ts";
import { authenticateAdmin } from "../middleware/auth.ts";

const router = Router();

router.get("/", getAllCategories);
router.get("/:id", getCategoryById);
router.post("/", authenticateAdmin, createCategory);
router.put("/:id", authenticateAdmin, updateCategory);
router.delete("/:id", authenticateAdmin, deleteCategory);

export default router;
