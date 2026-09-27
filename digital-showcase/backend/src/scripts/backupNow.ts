// Makes a backup right now, the same as the nightly one.
//   Docker:  docker compose exec backend npm run backup
//   Locally: npx tsx src/scripts/backupNow.ts
import { closeDb, initDatabase } from "../database/db.js";
import { runBackup } from "../services/backupService.js";

await initDatabase();
const run = await runBackup();
closeDb();
if (run.status !== "OK") {
  console.error(`Backup failed: ${run.error}`);
  process.exit(1);
}
console.log(`Backup done (${run.target}): database ${run.databaseBytes} bytes${run.uploadedFiles != null ? `, ${run.uploadedFiles} new photos sent` : ""}.`);
