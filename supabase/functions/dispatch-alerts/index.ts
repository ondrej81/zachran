// dispatch-alerts (v2)
//
// Checks each active wishlist item by fetching its product page with ?lm=1
// (so last-minute prices are surfaced). Uses WAREHOUSE_COOKIE_HEADER if set
// so warehouse-specific offers are honored.
//
// Two run modes:
//   • Normal (called by pg_cron at *:05 every hour) — only does work when the
//     current Prague hour matches settings.alert_hour. Sends one Resend digest
//     for new matches and writes alert_log to dedup against same-day repeats.
//   • Refresh (?refresh=1) — updates wishlist_items.last_* status columns
//     without sending email. Triggered by the wife's "Aktualizovat" button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { parseProduct, lmUrl, type ProductState } from "../_shared/rohlik.ts";
import { renderEmail, type Match } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM")
  ?? "Rohlík Wishlist <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://example.vercel.app";
const WAREHOUSE_COOKIE_HEADER = Deno.env.get("WAREHOUSE_COOKIE_HEADER") ?? "";

const FETCH_BATCH = 8;

function pragueNow() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

async function sendEmail(to: string, subject: string, html: string)
  : Promise<string | null> {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not set; would send:", { to, subject });
    return null;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`resend ${r.status}: ${JSON.stringify(body)}`);
  return body.id ?? null;
}

type Item = {
  id: string;
  rohlik_product_id: number;
  source_url: string;
  min_discount_pct: number;
};

type CheckResult = { item: Item; parsed: ProductState | null; error: string | null };

async function checkProduct(item: Item): Promise<CheckResult> {
  try {
    const r = await fetch(lmUrl(item.source_url), {
      headers: {
        "User-Agent": "Mozilla/5.0 rohlik-wishlist/2.0",
        "Accept-Language": "cs,en;q=0.9",
        ...(WAREHOUSE_COOKIE_HEADER ? { Cookie: WAREHOUSE_COOKIE_HEADER } : {}),
      },
    });
    if (!r.ok) return { item, parsed: null, error: `HTTP ${r.status}` };
    const html = await r.text();
    const parsed = parseProduct(html, item.rohlik_product_id);
    return { item, parsed, error: parsed ? null : "couldn't parse product" };
  } catch (e) {
    return { item, parsed: null, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: settingsRows, error: sErr } = await sb
    .from("settings").select("*").eq("id", 1).limit(1);
  if (sErr) return new Response(`db: ${sErr.message}`, { status: 500 });
  const settings = settingsRows?.[0];
  if (!settings) {
    return new Response(JSON.stringify({ skipped: "no settings row" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  const refreshOnly = url.searchParams.get("refresh") === "1";
  const force = url.searchParams.get("force") === "1";
  const { date: today, hour } = pragueNow();

  // Normal cron tick: only run during the alert hour.
  if (!refreshOnly && !force && hour !== settings.alert_hour) {
    return new Response(JSON.stringify({
      skipped: "wrong hour", hour, want: settings.alert_hour,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Need an email recipient for the email path.
  if (!refreshOnly && !settings.alert_email) {
    return new Response(JSON.stringify({ skipped: "no alert_email configured" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const { data: items } = await sb
    .from("wishlist_items")
    .select("id, rohlik_product_id, source_url, min_discount_pct")
    .eq("is_active", true);
  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ ok: true, items: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Fetch all products in small parallel batches to stay polite.
  const results: CheckResult[] = [];
  for (let i = 0; i < items.length; i += FETCH_BATCH) {
    const chunk = items.slice(i, i + FETCH_BATCH) as Item[];
    const r = await Promise.all(chunk.map(checkProduct));
    results.push(...r);
  }

  // Update status columns on every item (so the UI badge reflects today's check).
  const now = new Date().toISOString();
  await Promise.all(results.map(({ item, parsed, error }) =>
    sb.from("wishlist_items").update({
      last_check_at: now,
      last_sale_price: parsed?.salePrice ?? null,
      last_original_price: parsed?.originalPrice ?? null,
      last_discount_pct: parsed?.discountPct ?? null,
      last_sale_valid_till: parsed?.saleValidTill ?? null,
      last_check_error: error,
    }).eq("id", item.id)
  ));

  if (refreshOnly) {
    return new Response(JSON.stringify({
      ok: true,
      mode: "refresh",
      checked: results.length,
      withSale: results.filter((r) => r.parsed?.salePrice).length,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Find all candidates above each item's threshold.
  const candidates = results.flatMap(({ item, parsed }) => {
    if (!parsed?.salePrice || parsed.discountPct === null) return [];
    if (parsed.discountPct < item.min_discount_pct) return [];
    return [{ item, parsed }];
  });

  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Filter against alert_log to avoid double-sending today.
  const ids = candidates.map((c) => c.parsed.productId);
  const { data: existing } = await sb
    .from("alert_log")
    .select("rohlik_product_id")
    .eq("alert_date", today)
    .in("rohlik_product_id", ids);
  const alreadySent = new Set((existing ?? []).map((a: any) => a.rohlik_product_id));
  const newMatches = candidates.filter((c) => !alreadySent.has(c.parsed.productId));

  if (newMatches.length === 0) {
    return new Response(JSON.stringify({
      ok: true, sent: 0, suppressed: candidates.length,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const emailMatches: Match[] = newMatches.map((m) => ({
    rohlik_product_id: m.parsed.productId,
    name: m.parsed.name,
    image_url: m.parsed.imageUrl,
    url: m.parsed.url,
    sale_price: m.parsed.salePrice,
    original_price: m.parsed.originalPrice,
    discount_pct: m.parsed.discountPct,
    sale_text: m.parsed.saleText,
    sale_valid_till: m.parsed.saleValidTill,
  }));

  const subject = `Rohlík: ${newMatches.length} oblíbených ve slevě`;
  const messageId = await sendEmail(
    settings.alert_email, subject, renderEmail(emailMatches, APP_URL),
  );

  await sb.from("alert_log").upsert(
    newMatches.map((m) => ({
      rohlik_product_id: m.parsed.productId,
      alert_date: today,
      matched_discount_pct: m.parsed.discountPct ?? 0,
      sale_price: m.parsed.salePrice,
      resend_message_id: messageId,
    })),
    { onConflict: "rohlik_product_id,alert_date" },
  );

  return new Response(JSON.stringify({
    ok: true,
    mode: "alert",
    sent: newMatches.length,
    suppressed: candidates.length - newMatches.length,
    messageId,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
