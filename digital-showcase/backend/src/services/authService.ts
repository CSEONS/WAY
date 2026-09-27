import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/http.js";
import { findUserById, findUserByLogin, getOwner, setUserPassword, touchLastSeen } from "./userService.js";
import type { JwtPayload } from "../types/models.js";

// Owners sign in on their own phone; a long session means no weekly re-login.
const SESSION_LIFETIME = "90d";
// «Войти как владелец» is for a support call, not a second account.
const IMPERSONATION_LIFETIME = "2h";

function secret() {
  return process.env.JWT_SECRET ?? "change_me";
}

export async function login(loginValue: string, password: string) {
  const user = await findUserByLogin(loginValue);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Неверный логин или пароль");
  }
  const payload: JwtPayload = { userId: user.id, role: user.role };
  const token = jwt.sign(payload, secret(), { expiresIn: SESSION_LIFETIME });
  await touchLastSeen({ id: user.id, lastSeenAt: null });
  const { passwordHash: _, ...safeUser } = user;
  return { token, user: safeUser };
}

/** A short session as the owner for an admin helping them on the phone. The caller logs it. */
export async function impersonate(adminId: string, ownerId: string) {
  const owner = await getOwner(ownerId);
  if (!owner) throw new HttpError(404, "Владелец не найден");
  const payload: JwtPayload = { userId: owner.id, role: "OWNER", impersonatedBy: adminId };
  return { token: jwt.sign(payload, secret(), { expiresIn: IMPERSONATION_LIFETIME }), owner };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await findUserById(userId);
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Текущий пароль указан неверно");
  }
  if (newPassword.length < 6) throw new HttpError(400, "Новый пароль должен содержать минимум 6 символов");
  await setUserPassword(userId, newPassword);
}

export async function me(session: JwtPayload) {
  const user = await findUserById(session.userId);
  if (!user) throw new HttpError(404, "Пользователь не найден");
  const { passwordHash: _, ...safeUser } = user;
  if (!session.impersonatedBy) {
    await touchLastSeen(user);
    return safeUser;
  }
  const admin = await findUserById(session.impersonatedBy);
  return { ...safeUser, impersonatedBy: { id: session.impersonatedBy, name: admin?.name ?? "Администратор" } };
}
