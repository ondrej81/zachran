import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({
  alert_email: z.string().email(),
  alert_hour: z.number().int().min(0).max(23),
  default_min_discount_pct: z.number().int().min(0).max(99),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/settings");
  return NextResponse.json({ ok: true });
}
