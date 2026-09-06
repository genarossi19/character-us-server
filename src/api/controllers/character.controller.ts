import type { Request, Response } from "express";
import Character from "../../db/models/Character.ts";
import { getRandomCharacterByCategory } from "../services/character/character.service.ts";

export const getAllCharacters = async (_req: Request, res: Response) => {
  try {
    const characters = await Character.findAll();
    const response = characters.map((c) => c.get({ plain: true }));
    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener personajes" });
  }
};

export const getCharacterById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return res.status(404).json({ message: "Personaje no encontrado" });
    res.json(character.get({ plain: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener personaje" });
  }
};

export const getCharactersByCategory = async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  try {
    const characters = await Character.findAll({
      where: { category_id: categoryId },
    });
    const response = characters.map((c) => c.get({ plain: true }));
    res.json(response);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al obtener personajes por categoría" });
  }
};

export const getRandomCharacter = async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  try {
    const character = await getRandomCharacterByCategory(categoryId);
    if (!character)
      return res
        .status(404)
        .json({ message: "No hay personajes para esta categoría" });
    res.json(character);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener personaje aleatorio" });
  }
};

export const createCharacter = async (req: Request, res: Response) => {
  const { name, description, imageUrl, category_id } = req.body;
  if (!name || !category_id)
    return res
      .status(400)
      .json({ message: "El nombre y category_id son obligatorios" });
  try {
    const character = await Character.create({
      name,
      description,
      imageUrl,
      category_id,
    });
    res.status(201).json(character.get({ plain: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear personaje" });
  }
};

export const updateCharacter = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, imageUrl, category_id } = req.body;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return res.status(404).json({ message: "Personaje no encontrado" });
    await character.update({ name, description, imageUrl, category_id });
    res.json(character.get({ plain: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar personaje" });
  }
};

export const deleteCharacter = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return res.status(404).json({ message: "Personaje no encontrado" });
    await character.destroy();
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al eliminar personaje" });
  }
};
