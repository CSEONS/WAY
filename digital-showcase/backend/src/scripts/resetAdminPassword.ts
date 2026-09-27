// Sets the administrator's login and password from ADMIN_EMAIL / ADMIN_PASSWORD.
// The server never does this by itself after the first start, so a password
// changed in «Аккаунт» stays. Run it when the admin password is lost:
//   Docker:  docker compose exec backend npm run admin:reset-password
//   Locally: npx tsx src/scripts/resetAdminPassword.ts
import bcrypt from "bcryptjs";
import { ADMIN_PASSWORD_MIN_LENGTH, closeDb, getDb, initDatabase } from "../database/db.js";

const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
  process.exit(1);
}
if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
  console.error(`ADMIN_PASSWORD must contain at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
  process.exit(1);
}

await initDatabase();
const db = await getDb();
const admin = await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY createdAt LIMIT 1");
if (!admin) {
  console.log(`Administrator ${email} created.`);
} else {
  await db.run("UPDATE users SET email = ?, passwordHash = ?, updatedAt = ? WHERE id = ?", email, await bcrypt.hash(password, 12), new Date().toISOString(), admin.id);
  console.log(`Password of administrator ${email} is reset.`);
}
closeDb();
