import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/http.js";
import { findUserById, findUserByLogin } from "./userService.js";
import type { JwtPayload } from "../types/models.js";

export async function login(loginValue: string, password: string) {
  const user = await findUserByLogin(loginValue);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Неверный логин или пароль");
  }
  const payload: JwtPayload = { userId: user.id, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET ?? "change_me", { expiresIn: "7d" });
  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser };
}

export async function me(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new HttpError(404, "Пользователь не найден");
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}
