import type { Request, Response } from "express";
import Character from "../../db/models/Character.ts";
import { getRandomCharacterByCategory } from "../services/character/character.service.ts";
import { sendError } from "../middleware/sendError.ts";

export const getAllCharacters = async (_req: Request, res: Response) => {
  try {
    const characters = await Character.findAll();
    const response = characters.map((c) => c.get({ plain: true }));
    res.json(response);
  } catch (error) {
    sendError(res, 500, "No pudimos cargar los personajes. Intenta nuevamente.", error);
  }
};

export const getCharacterById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return sendError(res, 404, "Personaje no encontrado");
    res.json(character.get({ plain: true }));
  } catch (error) {
    sendError(res, 500, "No pudimos cargar el personaje. Intenta nuevamente.", error);
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
    sendError(res, 500, "No pudimos cargar los personajes de esta categoría. Intenta nuevamente.", error);
  }
};

export const getRandomCharacter = async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  try {
    const character = await getRandomCharacterByCategory(categoryId);
    if (!character)
      return sendError(res, 404, "No hay personajes para esta categoría");
    res.json(character);
  } catch (error) {
    sendError(res, 500, "No pudimos elegir un personaje. Intenta nuevamente.", error);
  }
};

export const createCharacter = async (req: Request, res: Response) => {
  const { name, description, imageUrl, category_id } = req.body;
  if (!name || !category_id)
    return sendError(res, 400, "Ingresa un nombre y selecciona una categoría.");
  try {
    const character = await Character.create({
      name,
      description,
      imageUrl,
      category_id,
    });
    res.status(201).json(character.get({ plain: true }));
  } catch (error) {
    sendError(res, 500, "No pudimos crear el personaje. Intenta nuevamente.", error);
  }
};

export const updateCharacter = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, imageUrl, category_id } = req.body;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return sendError(res, 404, "Personaje no encontrado");
    await character.update({ name, description, imageUrl, category_id });
    res.json(character.get({ plain: true }));
  } catch (error) {
    sendError(res, 500, "No pudimos actualizar el personaje. Intenta nuevamente.", error);
  }
};

export const deleteCharacter = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const character = await Character.findByPk(id);
    if (!character)
      return sendError(res, 404, "Personaje no encontrado");
    await character.destroy();
    res.status(204).send();
  } catch (error) {
    sendError(res, 500, "No pudimos eliminar el personaje. Intenta nuevamente.", error);
  }
};
