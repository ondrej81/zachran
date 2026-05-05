import { NextResponse } from "next/server";

// Tiny shim that the GitHub Actions job can call to trigger dispatch-alerts
// without a direct line to Supabase. Auth via Bearer CRON_SECRET. The Edge
// Function URL is constructed from NEXT_PUBLIC_SUPABASE_URL.
//
// This route is excluded from the basic-auth middleware.

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SUPABASE_URL not set" }, { status: 500 });
  }
  const fnUrl = supabaseUrl.replace(".supabase.co", ".functions.supabase.co")
    + "/dispatch-alerts";
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: await req.text(),
  });
  const text = await r.text();
  return new NextResponse(text, { status: r.status });
}
