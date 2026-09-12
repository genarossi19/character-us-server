import type { Request, Response } from "express";
import Category from "../../db/models/Category.ts";
import { sendError } from "../middleware/sendError.ts";

export const getAllCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await Category.findAll({
      attributes: ["id", "name"],
    });
    res.json(categories);
  } catch (error) {
    sendError(res, 500, "No pudimos cargar las categorías. Intenta nuevamente.", error);
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category)
      return sendError(res, 404, "Categoría no encontrada");
    res.json(category);
  } catch (error) {
    sendError(res, 500, "No pudimos cargar la categoría. Intenta nuevamente.", error);
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return sendError(res, 400, "Ingresa un nombre para la categoría.");
    }
    const category = await Category.create({ name, description, status });
    res.status(201).json(category);
  } catch (error) {
    sendError(res, 500, "No pudimos crear la categoría. Intenta nuevamente.", error);
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    const category = await Category.findByPk(id);
    if (!category)
      return sendError(res, 404, "Categoría no encontrada");
    await category.update({ name, description, status });
    res.json(category);
  } catch (error) {
    sendError(res, 500, "No pudimos actualizar la categoría. Intenta nuevamente.", error);
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category)
      return sendError(res, 404, "Categoría no encontrada");
    await category.destroy();
    res.status(204).send();
  } catch (error) {
    sendError(res, 500, "No pudimos eliminar la categoría. Intenta nuevamente.", error);
  }
};
