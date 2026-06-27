import type { JwtPayload } from "./models.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
