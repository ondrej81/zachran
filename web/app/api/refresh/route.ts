import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";

// POST /api/refresh — invokes the dispatch-alerts edge function in refresh
// mode (no email sent, just updates wishlist_items.last_*).

export async function POST() {
  const e = env();
  if (!e.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const fnUrl =
    e.NEXT_PUBLIC_SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co")
    + "/dispatch-alerts?refresh=1";
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.CRON_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trigger: "refresh" }),
  });
  const text = await r.text();
  if (!r.ok) return NextResponse.json({ error: text }, { status: r.status });
  revalidatePath("/");
  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
