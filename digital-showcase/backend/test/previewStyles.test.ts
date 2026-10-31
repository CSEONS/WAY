import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-preview-styles-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const styles = await import("../src/services/previewStyleService.js");
const { previewStyleSchema, parseBody } = await import("../src/utils/validation.js");

await initDatabase();

const draft = { name: "Новогодний", description: "Ёлка и огоньки", look: "Festive New Year scene", textLayout: "", usesScene: 0, usesTheme: 1, usesFeatures: 0, isActive: 1 };

test("новая база: рекламная карточка включена, остальные стили ждут проверки", async () => {
  const list = await styles.listStyles();
  assert.deepEqual(
    list.map((style) => [style.id, style.isActive]),
    [
      ["advert", 1],
      ["catalog", 0],
      ["lifestyle", 0],
      ["flatlay", 0],
      ["premium", 0]
    ]
  );
  const owner = await styles.ownerStyles();
  assert.deepEqual(owner.map((style) => style.id), ["advert"]);
  assert.equal("look" in owner[0], false, "owners don't get the prompt");
  assert.equal(owner[0].hasText, true);
});

test("стиль для превью: выбранный включённый, иначе первый включённый", async () => {
  assert.match((await styles.styleForPreview("catalog")).look, /3D|advertising/, "a hidden style falls back to the first one on");
  assert.match((await styles.styleForPreview("")).look, /advertising/);
  assert.match((await styles.styleForPreview("нет такого")).look, /advertising/);
  await styles.saveStyle("catalog", { ...(await styles.getStyle("catalog"))!, isActive: 1 });
  assert.match((await styles.styleForPreview("catalog")).look, /catalog/);
});

test("новый стиль встаёт в конец, порядок меняется", async () => {
  const created = await styles.saveStyle(null, parseBody(previewStyleSchema, draft));
  const list = await styles.listStyles();
  assert.equal(list.at(-1)!.id, created.id);
  const reordered = await styles.reorderStyles([created.id, ...list.filter((style) => style.id !== created.id).map((style) => style.id)]);
  assert.equal(reordered[0].id, created.id);
  assert.equal((await styles.ownerStyles())[0].name, "Новогодний");
});

test("последний включённый стиль нельзя выключить или удалить", async () => {
  for (const style of await styles.listStyles()) {
    if (style.id !== "advert" && style.isActive) await styles.saveStyle(style.id, { ...style, isActive: 0 });
  }
  const advert = (await styles.getStyle("advert"))!;
  await assert.rejects(styles.saveStyle("advert", { ...advert, isActive: 0 }), (error: { status?: number }) => error.status === 400);
  await assert.rejects(styles.deleteStyle("advert"), (error: { status?: number }) => error.status === 400);
  await styles.deleteStyle("premium");
  assert.equal(await styles.getStyle("premium"), null);
});

test("картинка-пример сохраняется и заменяется, старый файл удаляется", async () => {
  const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#336699" } }).png().toBuffer();
  const file = { buffer: png, mimetype: "image/png", originalname: "sample.png", size: png.length };
  const first = await styles.setSample("advert", file);
  assert.match(first.sample!, /^\/uploads\/.+\.webp$/);
  const firstPath = path.join(process.env.UPLOAD_DIR!, path.basename(first.sample!));
  assert.ok(fs.existsSync(firstPath));
  const removed = await styles.setSample("advert", null);
  assert.equal(removed.sample, null);
  assert.equal(fs.existsSync(firstPath), false);
});

test("пустой вид стиля — понятная ошибка", () => {
  assert.throws(() => parseBody(previewStyleSchema, { ...draft, look: " " }), (error: { status?: number }) => error.status === 400);
});

test.after(async () => {
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
