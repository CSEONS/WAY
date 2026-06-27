import { asyncHandler, requireFields } from "../utils/http.js";
import * as authService from "../services/authService.js";

export const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["login", "password"]);
  res.json(await authService.login(String(req.body.login), String(req.body.password)));
});

export const me = asyncHandler(async (req, res) => {
  res.json(await authService.me(req.user!.userId));
});

export const logout = asyncHandler(async (_req, res) => {
  res.json({ message: "ok" });
});
