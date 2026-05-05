// TS port of scraper/rohlik_alert.py's extraction logic, narrowed to a single
// product page (preview use case): pull name + image. Walks the dehydrated
// React-Query state inside __NEXT_DATA__ and prefers the entry whose
// productId matches the one in the URL. Falls back to Open Graph meta tags.

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export type Preview = {
  productId: number;
  name: string;
  imageUrl: string | null;
  slug: string | null;
};

function findInNext(data: unknown, productId: number): Preview | null {
  let best: Preview | null = null;

  function walk(node: any) {
    if (best) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (
      typeof node.productId === "number" &&
      typeof node.name === "string" &&
      node.productId === productId
    ) {
      best = {
        productId,
        name: node.name,
        imageUrl: node.image?.path ?? null,
        slug: node.slug ?? null,
      };
      return;
    }
    for (const v of Object.values(node)) walk(v);
  }

  walk(data);
  return best;
}

function ogMeta(html: string, prop: string): string | null {
  // Either attribute order: property=… content=… or content=… property=…
  const a = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*property=["']${prop}["']`,
    "i",
  );
  return html.match(a)?.[1] ?? html.match(b)?.[1] ?? null;
}

export function parseProductPage(
  html: string,
  productId: number,
  slugFromUrl: string,
): Preview | null {
  const m = html.match(NEXT_DATA);
  if (m) {
    try {
      const found = findInNext(JSON.parse(m[1]), productId);
      if (found) return found;
    } catch { /* ignore parse error and fall back to OG */ }
  }
  const title = ogMeta(html, "og:title");
  const image = ogMeta(html, "og:image");
  if (!title) return null;
  return { productId, name: title, imageUrl: image, slug: slugFromUrl };
}
