import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

import { app } from "./app.js";
import { initDatabase } from "./database/db.js";

const port = Number(process.env.PORT ?? 4000);

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.log(process.env.JWT_SECRET);
  
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}

await initDatabase();

app.listen(port, () => {
  console.log(`Backend started on ${port}`);
});
