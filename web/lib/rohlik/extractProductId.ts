// Pull the numeric product id and slug from a rohlik.cz product URL.
// Returns null if the URL doesn't match the expected shape.

const RX = /^\/(\d+)-([a-z0-9-]+)\/?$/i;

export function extractProductId(url: string): { id: number; slug: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)rohlik\.cz$/i.test(u.hostname)) return null;
  const m = u.pathname.match(RX);
  if (!m) return null;
  return { id: Number(m[1]), slug: m[2] };
}
