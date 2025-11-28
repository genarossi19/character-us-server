import type { Request, Response } from "express";
import Character from "../character/character.model.ts";
import type { CharacterType } from "../../../types/Character.ts";
import type ErrorResponse from "../../../types/Error.ts";

import { getRandomCharacterByCategory } from "./character.service.ts";

// Obtener todos los personajes
export const getAllCharacters = async (
  req: Request,
  res: Response<CharacterType[] | ErrorResponse>
) => {
  try {
    const characters = await Character.findAll();
    // Convertimos a objeto plano
    const response: CharacterType[] = characters.map((c) =>
      c.get({ plain: true })
    );
    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener personajes" });
  }
};

// Obtener personaje por ID
export const getCharacterById = async (
  req: Request,
  res: Response<CharacterType | ErrorResponse>
) => {
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

// Obtener personajes por category_id
export const getCharactersByCategory = async (
  req: Request,
  res: Response<CharacterType[] | ErrorResponse>
) => {
  const { categoryId } = req.params;
  try {
    const characters = await Character.findAll({
      where: { category_id: categoryId },
    });
    const response: CharacterType[] = characters.map((c) =>
      c.get({ plain: true })
    );
    res.json(response);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error al obtener personajes por categoría" });
  }
};

export const getRandomCharacter = async (
  req: Request,
  res: Response<any | ErrorResponse>
) => {
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

// Crear nuevo personaje
export const createCharacter = async (
  req: Request,
  res: Response<CharacterType | ErrorResponse>
) => {
  const { name, description, image, category_id } = req.body;
  if (!name || !category_id)
    return res
      .status(400)
      .json({ message: "El nombre y category_id son obligatorios" });

  try {
    const character = await Character.create({
      name,
      description,
      image,
      category_id,
    });
    res.status(201).json(character.get({ plain: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear personaje" });
  }
};

// Actualizar personaje
export const updateCharacter = async (
  req: Request,
  res: Response<CharacterType | ErrorResponse>
) => {
  const { id } = req.params;
  const { name, description, image, category_id } = req.body;

  try {
    const character = await Character.findByPk(id);
    if (!character)
      return res.status(404).json({ message: "Personaje no encontrado" });

    await character.update({ name, description, image, category_id });
    res.json(character.get({ plain: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar personaje" });
  }
};

// Eliminar personaje
export const deleteCharacter = async (
  req: Request,
  res: Response<null | ErrorResponse>
) => {
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
