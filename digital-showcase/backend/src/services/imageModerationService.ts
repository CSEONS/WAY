import sharp from "sharp";
import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { completeJson, isAiConfigured } from "./aiProvider.js";
import { measureTokens } from "./aiUsageService.js";
import { notifyStoreOwner } from "./notificationService.js";

// Photos must not show faces: of people and animals — alive, on photos,
// prints, drawings or toys — and of mannequins and dolls. A body without a
// face is fine: hands, legs, a model cut off at the nose, a person from the
// back — that's how clothes are shown. Every uploaded product photo and logo
// is checked by the AI model; a photo with a face goes to moderation and the
// owner gets a notification with the rule. The photo stays on the storefront:
// the moderator (the admin, for now) shows it, hides it, or takes the whole
// product off the storefront. Nothing is painted over.

export interface LivingBeings {
  /** Short Russian descriptions: «лицо человека», «морда кота на принте». Empty — no faces. */
  found: string[];
}

export type ImageKind = "PRODUCT" | "LOGO";
export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

const INSTRUCTIONS = `Ты проверяешь фото для витрины магазина одежды. Найди на изображении только лица: лица людей и морды животных (включая птиц, рыб и насекомых) — настоящие или изображённые на фото, рисунках, принтах и вышивке на одежде, игрушках, а также лица манекенов и кукол.
Лицо считается, если видны глаза или большая часть лица. Не считаются: тело без лица — руки, ноги, торс, шея, силуэт; человек со спины; модель, у которой лицо обрезано кадром (видны только губы или подбородок) или закрыто; манекен без головы. Растения не считаются.
Ответ — только JSON-объект:
{"found": ["коротко по-русски, чьё лицо найдено, например «лицо человека», «морда кота на принте футболки»"]}
Если лиц нет — {"found": []}.`;

/** The model's answer, made safe: a few short strings. */
export function parseLivingBeings(answer: string): LivingBeings {
  let data: unknown;
  try {
    data = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch {
    throw new Error("ИИ ответил не JSON-объектом");
  }
  const raw = (data && typeof data === "object" ? data : {}) as { found?: unknown };
  return { found: cleanFindings(raw.found) };
}

/** At most 10 short descriptions — from the model or from the owner's form (see flagImage). */
export function cleanFindings(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Asks the AI model who is on the picture. Null when AI isn't configured.
 * The check is the service's own cost, not the owner's: its tokens are kept
 * out of the request that called it (a nested measureTokens).
 */
export async function findLivingBeings(image: Buffer): Promise<LivingBeings | null> {
  if (!isAiConfigured()) return null;
  const small = await sharp(image, { failOn: "error" }).rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const { result } = await measureTokens(() =>
    completeJson({
      instructions: INSTRUCTIONS,
      text: "Чьи лица есть на этой картинке? Ответь JSON.",
      images: [`data:image/jpeg;base64,${small.toString("base64")}`]
    })
  );
  return parseLivingBeings(result);
}

export interface ImageRef {
  url: string;
  kind: ImageKind;
  storeId: string;
  productId?: string | null;
}

/**
 * Sends a photo or logo to moderation with what was found on it. Used by the
 * check below and right on upload, when «Превью с ИИ» already checked the picture.
 */
export async function flagImage(ref: ImageRef, found: string[]) {
  const db = await getDb();
  await db.run(
    `INSERT INTO image_checks (id, url, kind, storeId, productId, status, findings, createdAt) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
     ON CONFLICT(url) DO UPDATE SET status = 'PENDING', findings = excluded.findings, reviewedBy = NULL, reviewedAt = NULL`,
    crypto.randomUUID(),
    ref.url,
    ref.kind,
    ref.storeId,
    ref.productId ?? null,
    found.join(", "),
    new Date().toISOString()
  );
  await warnOwner(ref, found.join(", "));
}

/** The rule, in the words the owner reads in every moderation notification. */
const RULE = "На витрине нельзя показывать лица людей и морды животных — живых, на принтах и рисунках, у игрушек, манекенов и кукол.";

const subjectOf = async (ref: { kind: ImageKind; storeId: string; productId?: string | null }) => {
  const db = await getDb();
  if (ref.kind === "LOGO") {
    const store = await db.get<{ name: string }>("SELECT name FROM stores WHERE id = ?", ref.storeId);
    return { name: `Логотип магазина «${store?.name ?? ""}»`, link: `/dashboard/stores/${ref.storeId}/settings`, topic: `moderation:logo:${ref.storeId}` };
  }
  const product = ref.productId ? await db.get<{ title: string }>("SELECT title FROM products WHERE id = ?", ref.productId) : undefined;
  return {
    name: `Товар «${product?.title ?? "без названия"}»`,
    link: ref.productId ? `/dashboard/stores/${ref.storeId}/products/${ref.productId}/edit` : `/dashboard/stores/${ref.storeId}`,
    topic: `moderation:${ref.productId ?? ref.storeId}`
  };
};

/** «Подозрение на нарушение правил площадки»: what, which rule, what happens next. Never fails the upload. */
async function warnOwner(ref: ImageRef, findings: string) {
  try {
    const subject = await subjectOf(ref);
    const what = ref.kind === "LOGO" ? "Логотип" : "Фото";
    await notifyStoreOwner(ref.storeId, {
      source: "SYSTEM",
      title: "Подозрение на нарушение правил площадки",
      body: `${subject.name}: на ${ref.kind === "LOGO" ? "логотипе" : "фото"} ${findings}. ${RULE} ${what} пока видно покупателям. Администратор проверит его: если нарушение подтвердится, ${ref.kind === "LOGO" ? "логотип скроют" : "фото или весь товар скроют с витрины"}. Чтобы этого избежать, замените ${ref.kind === "LOGO" ? "логотип" : "фото"}.`,
      link: subject.link,
      topic: subject.topic
    });
  } catch (error) {
    console.error(`Moderation notice failed for ${ref.url}:`, error);
  }
}

/**
 * Checks an uploaded photo or logo; when a face is found, it waits for
 * moderation. Runs after the upload has answered, so failures are only
 * logged: the photo stays as it is.
 */
export async function checkImage(ref: ImageRef, image: Buffer) {
  try {
    const result = await findLivingBeings(image);
    if (!result?.found.length) return null;
    await flagImage(ref, result.found);
    return result;
  } catch (error) {
    console.error(`Image check failed for ${ref.url}:`, error);
    return null;
  }
}

/** SQL condition: the image at `column` may be shown to buyers — everything but what the moderator hid. */
export function visibleToBuyers(column: string) {
  return `NOT EXISTS (SELECT 1 FROM image_checks c WHERE c.url = ${column} AND c.status = 'REJECTED')`;
}

/** The store's logo for buyers: gone only when the moderator hid it. */
export async function publicLogo(logoUrl: string | null) {
  if (!logoUrl) return null;
  const db = await getDb();
  const check = await db.get<{ status: ModerationStatus }>("SELECT status FROM image_checks WHERE url = ?", logoUrl);
  return check?.status === "REJECTED" ? null : logoUrl;
}

/** Moderation of the given images, for the owner's own view: url → status and what was found. */
export async function moderationOf(urls: string[]) {
  if (!urls.length) return new Map<string, { status: ModerationStatus; findings: string }>();
  const db = await getDb();
  const rows = await db.all<{ url: string; status: ModerationStatus; findings: string }>(
    `SELECT url, status, findings FROM image_checks WHERE url IN (${urls.map(() => "?").join(", ")})`,
    urls
  );
  return new Map(rows.map((row) => [row.url, { status: row.status, findings: row.findings }]));
}

/** A replaced logo or a deleted photo needs no moderation any more. */
export async function forgetImage(url: string | null | undefined) {
  if (!url) return;
  const db = await getDb();
  await db.run("DELETE FROM image_checks WHERE url = ?", url);
}

export interface ImageCheck {
  id: string;
  url: string;
  kind: ImageKind;
  status: ModerationStatus;
  findings: string;
  createdAt: string;
  reviewedAt: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  productId: string | null;
  productTitle: string | null;
  /** The admin took the whole product off the storefront. */
  productBlocked: number;
}

/** Images for the moderation page, newest first; only those still in use. */
export async function listChecks(status: ModerationStatus, limit = 200) {
  const db = await getDb();
  return db.all<ImageCheck>(
    `SELECT c.id, c.url, c.kind, c.status, c.findings, c.createdAt, c.reviewedAt, s.id as storeId, s.name as storeName, s.slug as storeSlug,
            p.id as productId, p.title as productTitle, CASE WHEN p.blockedAt IS NULL THEN 0 ELSE 1 END as productBlocked
     FROM image_checks c
     JOIN stores s ON s.id = c.storeId
     LEFT JOIN products p ON p.id = c.productId
     WHERE c.status = ?
       AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))
     ORDER BY c.createdAt DESC LIMIT ?`,
    status,
    limit
  );
}

export async function countPending() {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM image_checks c JOIN stores s ON s.id = c.storeId
     WHERE c.status = 'PENDING' AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))`
  );
  return row?.count ?? 0;
}

/** Products the admin took off the storefront, newest first — to put them back after the owner fixed the photos. */
export async function listBlockedProducts(limit = 200) {
  const db = await getDb();
  return db.all<{ id: string; title: string; blockedAt: string; blockedReason: string | null; storeId: string; storeName: string; storeSlug: string; imageUrl: string | null }>(
    `SELECT p.id, p.title, p.blockedAt, p.blockedReason, s.id as storeId, s.name as storeName, s.slug as storeSlug,
            (SELECT i.url FROM product_images i WHERE i.productId = p.id ORDER BY i.sortOrder, i.createdAt LIMIT 1) as imageUrl
     FROM products p JOIN stores s ON s.id = p.storeId
     WHERE p.blockedAt IS NOT NULL ORDER BY p.blockedAt DESC LIMIT ?`,
    limit
  );
}

/** «Вернуть на витрину»: the product shows again (if the owner keeps it visible); the owner is told. */
export async function unblockProduct(productId: string) {
  const db = await getDb();
  const product = await db.get<{ id: string; storeId: string; title: string }>("SELECT id, storeId, title FROM products WHERE id = ? AND blockedAt IS NOT NULL", productId);
  if (!product) throw new HttpError(404, "Снятый товар не найден");
  await db.run("UPDATE products SET blockedAt = NULL, blockedReason = NULL WHERE id = ?", productId);
  try {
    await notifyStoreOwner(product.storeId, {
      source: "SYSTEM",
      title: "Товар снова на витрине",
      body: `Товар «${product.title}»: администратор вернул его на витрину, покупатели снова его видят.`,
      link: `/dashboard/stores/${product.storeId}/products/${product.id}/edit`,
      topic: `moderation:${product.id}`
    });
  } catch (error) {
    console.error(`Unblock notice failed for ${productId}:`, error);
  }
  return product;
}

export type ReviewDecision = "APPROVED" | "REJECTED" | "PRODUCT_BLOCKED";

/**
 * The moderator's decision: «Показывать» (APPROVED; a product taken off for
 * this photo comes back), «Скрыть фото» (REJECTED) or «Снять товар» (the photo
 * is hidden and the whole product leaves the storefront). The owner gets a
 * notification either way.
 */
export async function review(id: string, decision: ReviewDecision, reviewerId: string) {
  const db = await getDb();
  const check = await db.get<{ id: string; storeId: string; kind: ImageKind; productId: string | null; findings: string; url: string }>(
    "SELECT id, storeId, kind, productId, findings, url FROM image_checks WHERE id = ?",
    id
  );
  if (!check) throw new HttpError(404, "Фото на проверке не найдено");
  if (decision === "PRODUCT_BLOCKED" && !check.productId) throw new HttpError(400, "Снять с витрины можно только товар");
  const now = new Date().toISOString();
  await db.run("UPDATE image_checks SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?", decision === "APPROVED" ? "APPROVED" : "REJECTED", reviewerId, now, id);

  const product = check.productId ? await db.get<{ blockedAt: string | null }>("SELECT blockedAt FROM products WHERE id = ?", check.productId) : undefined;
  if (decision === "PRODUCT_BLOCKED") {
    await db.run(
      "UPDATE products SET blockedAt = ?, blockedReason = ? WHERE id = ?",
      now,
      `На фото ${check.findings || "лицо"}. ${RULE}`,
      check.productId
    );
  }
  const returned = decision === "APPROVED" && Boolean(product?.blockedAt);
  if (returned) await db.run("UPDATE products SET blockedAt = NULL, blockedReason = NULL WHERE id = ?", check.productId);

  try {
    const subject = await subjectOf(check);
    const notices: Record<ReviewDecision, { title: string; body: string }> = {
      APPROVED: {
        title: "Проверка пройдена",
        body: `${subject.name}: администратор проверил ${check.kind === "LOGO" ? "логотип" : "фото"} — нарушений нет.${returned ? " Товар снова на витрине." : ""}`
      },
      REJECTED: {
        title: check.kind === "LOGO" ? "Логотип скрыт администратором" : "Фото скрыто администратором",
        body:
          check.kind === "LOGO"
            ? `${subject.name}: на нём ${check.findings}. ${RULE} Покупатели видят магазин без логотипа. Загрузите другой логотип.`
            : `${subject.name}: на фото ${check.findings}. ${RULE} Покупатели видят товар без этого фото. Удалите его или замените другим.`
      },
      PRODUCT_BLOCKED: {
        title: "Товар снят с витрины",
        body: `${subject.name} снят с витрины администратором: на фото ${check.findings}. ${RULE} Покупатели его не видят. Замените фото и напишите администратору, чтобы вернуть товар.`
      }
    };
    await notifyStoreOwner(check.storeId, { source: "SYSTEM", ...notices[decision], link: subject.link, topic: subject.topic });
  } catch (error) {
    console.error(`Moderation decision notice failed for ${check.url}:`, error);
  }
  return check;
}
