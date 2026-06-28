import { asyncHandler, HttpError, requireFields } from "../utils/http.js";
import * as userService from "../services/userService.js";
import * as storeService from "../services/storeService.js";

export const listOwners = asyncHandler(async (_req, res) => res.json(await userService.listOwners()));

export const getOwner = asyncHandler(async (req, res) => {
  const owner = await userService.getOwner(String(req.params.id));
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const createOwner = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "password"]);
  res.status(201).json(await userService.createOwner(req.body));
});

export const updateOwner = asyncHandler(async (req, res) => {
  const owner = await userService.updateOwner(String(req.params.id), req.body);
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const changeOwnerPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["password"]);
  const owner = await userService.updateOwner(String(req.params.id), { password: req.body.password });
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const deleteOwner = asyncHandler(async (req, res) => {
  await userService.deleteOwner(String(req.params.id));
  res.status(204).send();
});

export const listStores = asyncHandler(async (_req, res) => res.json(await storeService.listStores()));

export const getStore = asyncHandler(async (req, res) => {
  const store = await storeService.getStore(String(req.params.id));
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const createStore = asyncHandler(async (req, res) => {
  requireFields(req.body, ["ownerId", "name", "slug"]);
  res.status(201).json(await storeService.createStore(req.body));
});

export const updateStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), req.body);
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const deleteStore = asyncHandler(async (req, res) => {
  await storeService.deleteStore(String(req.params.id));
  res.status(204).send();
});

export const extendSubscription = asyncHandler(async (req, res) => {
  const days = Number(req.body.days ?? 30);
  if (!Number.isFinite(days) || days <= 0) throw new HttpError(400, "days должен быть положительным числом");
  const store = await storeService.extendSubscription(String(req.params.id), days);
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const disableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 0 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const enableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 1 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const archiveStore = disableStore;

export const restoreStore = enableStore;
