import "dotenv/config";
import { app } from "./app.js";
import { initDatabase } from "./database/db.js";

const port = Number(process.env.PORT ?? 4000);

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must contain at least 32 characters in production");
}

await initDatabase();

app.listen(port, () => {
  console.log(`Backend started on ${port}`);
});
