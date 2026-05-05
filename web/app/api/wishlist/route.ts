import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const PostBody = z.object({
  productId: z.number().int().positive(),
  name: z.string().min(1).max(300),
  imageUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url(),
  minDiscountPct: z.number().int().min(0).max(99),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  minDiscountPct: z.number().int().min(0).max(99).optional(),
  isActive: z.boolean().optional(),
});

const DeleteBody = z.object({ id: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = PostBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { productId, name, imageUrl, sourceUrl, minDiscountPct } = parsed.data;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("wishlist_items")
    .upsert(
      {
        rohlik_product_id: productId,
        name,
        image_url: imageUrl ?? null,
        source_url: sourceUrl,
        min_discount_pct: minDiscountPct,
        is_active: true,
      },
      { onConflict: "rohlik_product_id" },
    )
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/");
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { id, ...rest } = parsed.data;
  const update: Record<string, unknown> = {};
  if (rest.minDiscountPct !== undefined) update.min_discount_pct = rest.minDiscountPct;
  if (rest.isActive !== undefined) update.is_active = rest.isActive;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from("wishlist_items").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from("wishlist_items").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
