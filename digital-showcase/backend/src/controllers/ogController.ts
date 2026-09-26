import type { Request, Response } from "express";
import { asyncHandler, requestOrigin } from "../utils/http.js";
import * as storeService from "../services/storeService.js";
import * as productService from "../services/productService.js";

// Renders minimal static HTML with Open Graph tags for link-preview crawlers
// (WhatsApp, Telegram, etc. — see nginx.conf's $m_upstream map, which routes
// only known bot user agents here; real visitors still get the React SPA).
// Crawlers don't execute JS, so this can't reuse the SPA — it has to be
// plain server-rendered HTML.

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

const originFrom = requestOrigin;

function renderOgPage({
  title,
  description,
  image,
  url,
  status
}: {
  title: string;
  description: string;
  image: string | null;
  url: string;
  status: number;
}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const imageTags = image
    ? `\n    <meta property="og:image" content="${escapeHtml(image)}" />\n    <meta name="twitter:image" content="${escapeHtml(image)}" />`
    : "";

  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safeUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:url" content="${safeUrl}" />${imageTags}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta http-equiv="refresh" content="0; url=${safeUrl}" />
    <script>location.replace(${JSON.stringify(url)});</script>
  </head>
  <body>
    <a href="${safeUrl}">${safeTitle}</a>
  </body>
</html>`;

  return { html, status };
}

export const renderStoreOg = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const origin = originFrom(req);
  const url = `${origin}/m/${encodeURIComponent(slug)}`;

  const store = await storeService.getStoreBySlug(slug);
  const { html, status } =
    store && storeService.isSubscriptionValid(store)
      ? renderOgPage({
          title: store.name,
          description: store.description ? truncate(store.description, 200) : `Витрина ${store.name}`,
          image: store.logoUrl ? `${origin}${store.logoUrl}` : null,
          url,
          status: 200
        })
      : renderOgPage({ title: "Магазин не найден", description: "Магазин не найден или недоступен.", image: null, url, status: 404 });

  res.status(status).type("html").send(html);
});

export const renderProductOg = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const productId = String(req.params.productId);
  const origin = originFrom(req);
  const url = `${origin}/m/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`;

  const store = await storeService.getStoreBySlug(slug);
  if (!store || !storeService.isSubscriptionValid(store)) {
    const { html, status } = renderOgPage({ title: "Товар не найден", description: "Товар не найден или недоступен.", image: null, url, status: 404 });
    res.status(status).type("html").send(html);
    return;
  }

  const product = await productService.getProduct(productId, store.id, true);
  if (!product) {
    const { html, status } = renderOgPage({ title: "Товар не найден", description: "Товар не найден или недоступен.", image: null, url, status: 404 });
    res.status(status).type("html").send(html);
    return;
  }

  const priceText = product.priceText || (product.price != null ? `${product.price.toLocaleString("ru-RU")} ₽` : "");
  const description = product.description ? truncate(product.description, 180) : [store.name, priceText].filter(Boolean).join(" · ");
  const image = product.images[0]?.url ? `${origin}${product.images[0].url}` : store.logoUrl ? `${origin}${store.logoUrl}` : null;

  const { html, status } = renderOgPage({
    title: `${product.title} — ${store.name}`,
    description,
    image,
    url,
    status: 200
  });
  res.status(status).type("html").send(html);
});
