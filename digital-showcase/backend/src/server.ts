import "dotenv/config";
import { app } from "./app.js";
import { initDatabase } from "./database/db.js";

const port = Number(process.env.PORT ?? 4000);

await initDatabase();

app.listen(port, () => {
  console.log(`Backend started on ${port}`);
});
