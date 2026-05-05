import { NextResponse } from "next/server";
import { z } from "zod";
import { extractProductId } from "@/lib/rohlik/extractProductId";
import { parseProductPage } from "@/lib/rohlik/parseProductPage";

const Body = z.object({ url: z.string().url() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  const ids = extractProductId(parsed.data.url);
  if (!ids) {
    return NextResponse.json(
      { error: "URL must look like https://www.rohlik.cz/<id>-<slug>" },
      { status: 400 },
    );
  }
  const r = await fetch(parsed.data.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 rohlik-wishlist/1.0",
      "Accept-Language": "cs,en;q=0.9",
    },
    next: { revalidate: 3600 },
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: `rohlik returned ${r.status}` },
      { status: 502 },
    );
  }
  const html = await r.text();
  const preview = parseProductPage(html, ids.id, ids.slug);
  if (!preview) {
    return NextResponse.json({ error: "couldn't parse product" }, { status: 502 });
  }
  return NextResponse.json({
    ...preview,
    sourceUrl: parsed.data.url,
  });
}
