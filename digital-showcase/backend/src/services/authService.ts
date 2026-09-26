import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/http.js";
import { findUserById, findUserByLogin, setUserPassword } from "./userService.js";
import type { JwtPayload } from "../types/models.js";

// Owners sign in on their own phone; a long session means no weekly re-login.
const SESSION_LIFETIME = "90d";

export async function login(loginValue: string, password: string) {
  const user = await findUserByLogin(loginValue);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Неверный логин или пароль");
  }
  const payload: JwtPayload = { userId: user.id, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET ?? "change_me", { expiresIn: SESSION_LIFETIME });
  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Текущий пароль указан неверно");
  }
  if (newPassword.length < 6) throw new HttpError(400, "Новый пароль должен содержать минимум 6 символов");
  await setUserPassword(userId, newPassword);
}

export async function me(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new HttpError(404, "Пользователь не найден");
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}
