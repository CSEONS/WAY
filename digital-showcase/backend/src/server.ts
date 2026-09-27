import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

import { app } from "./app.js";
import { assertProductionConfig } from "./config.js";
import { closeDb, initDatabase } from "./database/db.js";
import { reportProblem } from "./services/alertService.js";
import { startBackupSchedule } from "./services/backupService.js";
import { ensureThumbnails } from "./services/imageService.js";

const port = Number(process.env.PORT ?? 4000);

// An unsafe production start stops here, before anything listens.
assertProductionConfig();
await initDatabase();

const server = app.listen(port, () => {
  console.log(`Backend started on ${port}`);
});

// Photos uploaded before thumbnails existed get them in the background.
ensureThumbnails()
  .then((count) => count && console.log(`Created thumbnails for ${count} photos`))
  .catch((error) => console.error("Thumbnail backfill failed", error));

await startBackupSchedule();

process.on("unhandledRejection", (error) => void reportProblem("Необработанная ошибка на сервере", error));
process.on("uncaughtException", (error) => {
  // The process state is unknown: report, then let Docker restart it.
  void reportProblem("Сервер упал", error).finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();
});

/** docker compose stop / restart: finish requests and flush the database journal. */
function shutdown(signal: string) {
  console.log(`${signal}: shutting down`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
