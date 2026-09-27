import { asyncHandler } from "../utils/http.js";
import { changePasswordSchema, loginSchema, parseBody } from "../utils/validation.js";
import * as authService from "../services/authService.js";

export const login = asyncHandler(async (req, res) => {
  const { login, password } = parseBody(loginSchema, req.body);
  res.json(await authService.login(login, password));
});

export const me = asyncHandler(async (req, res) => {
  res.json(await authService.me(req.user!));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  await authService.changePassword(req.user!.userId, currentPassword, newPassword);
  res.json({ message: "ok" });
});

export const logout = asyncHandler(async (_req, res) => {
  res.json({ message: "ok" });
});
