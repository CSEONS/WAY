import * as productService from "../services/productService.js";
import * as storeService from "../services/storeService.js";
import { asyncHandler, requestOrigin } from "../utils/http.js";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export const robots = asyncHandler(async (req, res) => {
  const origin = requestOrigin(req);
  res.type("text/plain").send(
    ["User-agent: *", "Allow: /", "Disallow: /dashboard", "Disallow: /admin", "Disallow: /account", "Disallow: /login", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n")
  );
});

/** The landing page, every open storefront and its visible products. */
export const sitemap = asyncHandler(async (req, res) => {
  const origin = requestOrigin(req);
  const urls: { loc: string; lastmod?: string }[] = [{ loc: `${origin}/` }];

  const stores = (await storeService.listStores()).filter(storeService.isSubscriptionValid);
  for (const store of stores) {
    urls.push({ loc: `${origin}/m/${encodeURIComponent(store.slug)}`, lastmod: store.updatedAt });
    const products = await productService.listProducts(store.id, true);
    for (const product of products) {
      urls.push({ loc: `${origin}/m/${encodeURIComponent(store.slug)}/p/${product.id}`, lastmod: product.updatedAt });
    }
  }

  const body = urls
    .map((url) => `  <url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`)
    .join("\n");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
});
