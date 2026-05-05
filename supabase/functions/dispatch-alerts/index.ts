// Dispatch Rohlík wishlist alerts.
//
// Triggered by:
//   • the GitHub Actions scrape job (immediately after a fresh scrape)
//   • pg_cron every 15 min (catch-up for missed runs)
//
// Behaviour: if the current Prague hour matches settings.alert_hour, find every
// wishlist item that matches today's last-minute offers above its threshold and
// hasn't been emailed yet for today, send a single Resend digest email, and
// record one alert_log row per matched product.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { renderEmail, type Match } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM")
  ?? "Rohlík Wishlist <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://example.vercel.app";

function pragueNow() {
  // Build a Date interpreted as Europe/Prague wall time.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,        // YYYY-MM-DD
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

Deno.serve(async (req) => {
  // Authn: require Bearer CRON_SECRET (sent by pg_cron and GH Actions).
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
  if (!settings || !settings.alert_email) {
    return new Response(JSON.stringify({ skipped: "no alert_email configured" }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const { date: today, hour } = pragueNow();

  // Allow ?force=1 to bypass the hour gate (manual testing / scrape trigger).
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const fromScrape = body?.trigger === "scrape";

  if (!force && !fromScrape && hour !== settings.alert_hour) {
    return new Response(JSON.stringify({ skipped: "wrong hour", hour, want: settings.alert_hour }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }
  // When triggered by scrape, only send if the user is "now or earlier" today —
  // i.e. don't pre-send a 7am alert at 3am if the scrape ran early.
  if (fromScrape && hour < settings.alert_hour) {
    return new Response(JSON.stringify({ skipped: "scrape too early", hour, want: settings.alert_hour }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const { data: matches, error: mErr } = await sb
    .from("todays_matches").select("*");
  if (mErr) return new Response(`db: ${mErr.message}`, { status: 500 });
  if (!matches || matches.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const html = renderEmail(matches as Match[], APP_URL);
  const subject = `Rohlík: ${matches.length} oblíbených ve slevě`;
  const messageId = await sendEmail(settings.alert_email, subject, html);

  const rows = matches.map((m: any) => ({
    rohlik_product_id: m.rohlik_product_id,
    alert_date: today,
    scrape_run_id: m.scrape_run_id,
    matched_discount_pct: m.discount_pct ?? 0,
    sale_price: m.sale_price,
    resend_message_id: messageId,
  }));
  const { error: lErr } = await sb.from("alert_log").upsert(rows,
    { onConflict: "rohlik_product_id,alert_date" });
  if (lErr) console.error("alert_log upsert failed", lErr);

  return new Response(JSON.stringify({ ok: true, sent: matches.length, messageId }),
    { status: 200, headers: { "Content-Type": "application/json" } });
});
