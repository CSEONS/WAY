// Restores the database (and, optionally, photos) from a backup.
// STOP THE BACKEND FIRST. The current database is kept next to it as
// database.sqlite.before-restore-<time>.
//
//   Docker:
//     docker compose stop backend
//     docker compose run --rm backend npm run backup:restore -- --latest --photos
//     docker compose start backend
//   Locally: npx tsx src/scripts/restoreBackup.ts <file | --latest | --s3 <key>> [--photos]
//
//   <file>        a copy from the backups folder (database-….sqlite.gz)
//   --latest      the newest copy in the bucket (BACKUP_S3_*)
//   --s3 <key>    a specific copy in the bucket
//   --photos      also download photos missing from UPLOAD_DIR from the bucket
import fs from "node:fs";
import path from "node:path";
import { databaseFilename } from "../database/db.js";
import { backupSettings, unpackBackup, verifyDatabaseFile } from "../services/backupService.js";
import { uploadDir } from "../services/imageService.js";
import { S3Client } from "../utils/s3.js";

const args = process.argv.slice(2);
const settings = backupSettings();
const client = settings.s3 ? new S3Client(settings.s3) : null;
const needsS3 = args.includes("--latest") || args.includes("--s3") || args.includes("--photos");
if (needsS3 && !client) {
  console.error("BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY are required for --latest, --s3 and --photos.");
  process.exit(1);
}

async function source(): Promise<{ label: string; data: Buffer } | null> {
  if (args.includes("--latest")) {
    const copies = (await client!.list(`${settings.prefix}/db/`)).sort((a, b) => a.key.localeCompare(b.key));
    const newest = copies[copies.length - 1];
    if (!newest) throw new Error("No database copies in the bucket");
    return { label: newest.key, data: await client!.get(newest.key) };
  }
  const s3Index = args.indexOf("--s3");
  if (s3Index >= 0) {
    const key = args[s3Index + 1];
    if (!key) throw new Error("--s3 needs a key, e.g. showcase/db/database-2026-10-01T04-00-00Z.sqlite.gz");
    return { label: key, data: await client!.get(key) };
  }
  const file = args.find((arg) => !arg.startsWith("--"));
  if (file) return { label: file, data: await fs.promises.readFile(path.resolve(file)) };
  return null;
}

const backup = await source();
if (!backup && !args.includes("--photos")) {
  console.error("Say what to restore: a backup file, --latest or --s3 <key>. See the comment at the top of this script.");
  process.exit(1);
}

if (backup) {
  const target = databaseFilename();
  const unpacked = await unpackBackup(backup.data);
  const temp = `${target}.restoring`;
  await fs.promises.writeFile(temp, unpacked);
  const counts = verifyDatabaseFile(temp);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(target + suffix)) fs.renameSync(target + suffix, `${target}.before-restore-${stamp}${suffix}`);
  }
  fs.renameSync(temp, target);
  console.log(`Database restored from ${backup.label}: ${counts.stores} stores, ${counts.products} products, ${counts.users} users.`);
  console.log(`The previous database is kept as ${target}.before-restore-${stamp}`);
}

if (args.includes("--photos")) {
  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });
  const photos = await client!.list(`${settings.prefix}/uploads/`);
  let restored = 0;
  for (const photo of photos) {
    const name = path.basename(photo.key);
    const file = path.join(dir, name);
    if (fs.existsSync(file)) continue;
    await fs.promises.writeFile(file, await client!.get(photo.key));
    restored += 1;
  }
  console.log(`Photos: ${restored} downloaded, ${photos.length - restored} were already in place.`);
}
