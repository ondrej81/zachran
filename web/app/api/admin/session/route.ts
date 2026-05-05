import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

// PUT /api/admin/session — multipart form with a single field "file" containing
// a fresh storage_state.json. Validates JSON shape, uploads to the private
// "warehouse" Storage bucket, transactionally flips warehouse_sessions, runs
// a healthcheck.

async function healthcheck(cookies: Array<{ name: string; value: string }>):
  Promise<{ ok: boolean; productCount: number }> {
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const r = await fetch("https://www.rohlik.cz/zachran-a-usetri", {
    headers: {
      "User-Agent": "Mozilla/5.0 rohlik-wishlist/1.0",
      "Accept-Language": "cs,en;q=0.9",
      Cookie: cookieHeader,
    },
  });
  if (!r.ok) return { ok: false, productCount: 0 };
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { ok: false, productCount: 0 };
  // count "productId":N occurrences as a coarse signal
  const matches = html.match(/"productId":\d+/g) ?? [];
  const ids = new Set(matches);
  return { ok: ids.size >= 5, productCount: ids.size };
}

export async function PUT(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "not valid JSON" }, { status: 400 });
  }
  if (!Array.isArray(parsed?.cookies)) {
    return NextResponse.json(
      { error: "missing cookies[] — is this a Playwright storage_state.json?" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const path = `${randomUUID()}.json`;
  const { error: upErr } = await sb.storage.from("warehouse").upload(
    path,
    new Blob([text], { type: "application/json" }),
    { contentType: "application/json", upsert: false },
  );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Flip current row → new row in two statements (no real transaction over PostgREST,
  // but the partial unique index will reject any overlap).
  const { error: clrErr } = await sb
    .from("warehouse_sessions")
    .update({ is_current: false })
    .eq("is_current", true);
  if (clrErr) return NextResponse.json({ error: clrErr.message }, { status: 500 });

  const { data: row, error: insErr } = await sb
    .from("warehouse_sessions")
    .insert({ storage_path: path, is_current: true })
    .select()
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const hc = await healthcheck(parsed.cookies);
  await sb
    .from("warehouse_sessions")
    .update({ healthcheck_ok: hc.ok, healthcheck_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({
    ok: true,
    healthcheckOk: hc.ok,
    productCount: hc.productCount,
    cookieCount: parsed.cookies.length,
    sessionId: row.id,
  });
}

export async function POST(req: Request) {
  // alias for "re-run healthcheck on current session"
  if (new URL(req.url).searchParams.get("action") !== "healthcheck") {
    return NextResponse.json({ error: "use PUT to upload" }, { status: 405 });
  }
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from("warehouse_sessions")
    .select("*")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ error: "no current session" }, { status: 404 });
  }
  const { data: blob, error: dlErr } = await sb.storage
    .from("warehouse")
    .download(row.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? "download failed" }, { status: 500 });
  }
  let cookies: any[] = [];
  try {
    cookies = JSON.parse(await blob.text())?.cookies ?? [];
  } catch { /* fall through with empty cookies → healthcheck will fail */ }
  const hc = await healthcheck(cookies);
  await sb
    .from("warehouse_sessions")
    .update({ healthcheck_ok: hc.ok, healthcheck_at: new Date().toISOString() })
    .eq("id", row.id);
  return NextResponse.json({ ok: hc.ok, productCount: hc.productCount });
}
