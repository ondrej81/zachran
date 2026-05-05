// Deno-compatible product page parser. Used by dispatch-alerts to find the
// current sale state of a wishlist product. Mirrors web/lib/rohlik/parseProductPage.ts.

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export type ProductState = {
  productId: number;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  url: string | null;
  salePrice: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  saleText: string | null;
  saleValidTill: string | null;
  hasExpiringBadge: boolean;
};

function discountPct(sale: number | null, original: number | null): number | null {
  if (!sale || !original || original <= 0 || sale >= original) return null;
  return Math.max(0, Math.min(99, Math.round((1 - sale / original) * 100)));
}

export function parseProduct(html: string, expectedProductId: number): ProductState | null {
  const m = html.match(NEXT_DATA);
  if (!m) return null;
  let data: unknown;
  try { data = JSON.parse(m[1]); } catch { return null; }

  let result: ProductState | null = null;

  function walk(node: any) {
    if (result) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.productId === expectedProductId && typeof node.name === "string") {
      const prices = node.prices ?? {};
      const badges = (node.badges ?? []) as Array<{ type?: string }>;
      const sale = prices.salePrice ?? null;
      const orig = prices.originalPrice ?? null;
      result = {
        productId: expectedProductId,
        name: node.name,
        slug: node.slug ?? null,
        imageUrl: node.image?.path ?? null,
        url: node.slug ? `https://www.rohlik.cz/${expectedProductId}-${node.slug}` : null,
        salePrice: sale,
        originalPrice: orig,
        discountPct: discountPct(sale, orig),
        saleText: prices.saleText ?? null,
        saleValidTill: prices.saleValidTill ?? null,
        hasExpiringBadge: badges.some((b) => b?.type === "EXPIRING"),
      };
      return;
    }
    for (const v of Object.values(node)) walk(v);
  }
  walk(data);
  return result;
}

// Append ?lm=1 (or &lm=1) so Rohlík's last-minute view is rendered. Necessary
// for products whose discount is only visible in the Zachraň a ušetři section;
// regular-promo products show the discount on the plain URL too.
export function lmUrl(url: string): string {
  return url.includes("?") ? `${url}&lm=1` : `${url}?lm=1`;
}
