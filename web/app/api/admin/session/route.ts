import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

// PUT /api/admin/session — multipart form with a single field "file" containing
// session data. Two formats are accepted:
//
//   1. Playwright storage_state.json shape:
//      { "cookies": [{ name, value, domain, path, expires, httpOnly, secure, sameSite }, ...],
//        "origins": [...] }
//
//   2. Cookie-Editor / EditThisCookie browser-extension JSON (a flat array of
//      cookie objects with keys like expirationDate, sameSite: "lax", etc).
//      The server normalises this into Playwright shape before storing.
//
// Format 2 lets a non-technical admin bootstrap the warehouse session without
// running any terminal commands: install Cookie-Editor, log into rohlik.cz,
// click Export → JSON, upload the file here.

type CookieEditor = {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expirationDate?: number;
  session?: boolean;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

const SAMESITE_MAP: Record<string, "Strict" | "Lax" | "None"> = {
  strict: "Strict",
  lax: "Lax",
  none: "None",
  no_restriction: "None",
  unspecified: "Lax",
};

function normaliseCookie(c: CookieEditor): PlaywrightCookie {
  const same = (c.sameSite ?? "lax").toLowerCase();
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? "/",
    expires: c.session ? -1 : Math.round(c.expirationDate ?? -1),
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: SAMESITE_MAP[same] ?? "Lax",
  };
}

function coerceToPlaywrightShape(parsed: unknown):
  | { cookies: PlaywrightCookie[]; origins: unknown[] }
  | null {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return null;
    if (typeof parsed[0]?.name !== "string") return null;
    return {
      cookies: parsed.map((c) => normaliseCookie(c as CookieEditor)),
      origins: [],
    };
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).cookies)) {
    const obj = parsed as { cookies: any[]; origins?: any[] };
    // already Playwright-ish; if it has Cookie-Editor field names, normalise.
    const looksLikeCookieEditor =
      obj.cookies[0] && ("expirationDate" in obj.cookies[0] || "session" in obj.cookies[0]);
    return {
      cookies: looksLikeCookieEditor
        ? obj.cookies.map((c) => normaliseCookie(c as CookieEditor))
        : (obj.cookies as PlaywrightCookie[]),
      origins: obj.origins ?? [],
    };
  }
  return null;
}

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "not valid JSON" }, { status: 400 });
  }
  const shaped = coerceToPlaywrightShape(parsed);
  if (!shaped) {
    return NextResponse.json(
      {
        error: "expected either a Playwright storage_state.json " +
          "({ cookies: [...] }) or a Cookie-Editor JSON export (an array of cookie objects)",
      },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const path = `${randomUUID()}.json`;
  const blob = new Blob([JSON.stringify(shaped)], { type: "application/json" });
  const { error: upErr } = await sb.storage.from("warehouse").upload(
    path, blob,
    { contentType: "application/json", upsert: false },
  );
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

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

  const hc = await healthcheck(shaped.cookies);
  await sb
    .from("warehouse_sessions")
    .update({ healthcheck_ok: hc.ok, healthcheck_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({
    ok: true,
    healthcheckOk: hc.ok,
    productCount: hc.productCount,
    cookieCount: shaped.cookies.length,
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
