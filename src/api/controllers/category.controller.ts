import type { Request, Response } from "express";
import Category from "../../db/models/Category.ts";

export const getAllCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await Category.findAll({
      attributes: ["id", "name"],
    });
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener categorías" });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category)
      return res.status(404).json({ message: "Categoría no encontrada" });
    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener categoría" });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ message: "El campo 'name' es obligatorio" });
    }
    const category = await Category.create({ name, description, status });
    res.status(201).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear categoría" });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    const category = await Category.findByPk(id);
    if (!category)
      return res.status(404).json({ message: "Categoría no encontrada" });
    await category.update({ name, description, status });
    res.json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar categoría" });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category)
      return res.status(404).json({ message: "Categoría no encontrada" });
    await category.destroy();
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar categoría" });
  }
};
