import { supabaseAdmin } from "@/lib/supabase/server";
import type { TodaysMatch, WishlistItem } from "@/lib/types";
import AddItemCard from "./_components/AddItemCard";
import WishlistRow from "./_components/WishlistRow";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseAdmin();
  const [items, matches, settings] = await Promise.all([
    sb.from("wishlist_items").select("*").order("created_at", { ascending: false }),
    sb.from("todays_matches").select("*"),
    sb.from("settings").select("*").eq("id", 1).single(),
  ]);

  const wishlist = (items.data ?? []) as WishlistItem[];
  const matchByPid = new Map<number, TodaysMatch>();
  for (const m of (matches.data ?? []) as TodaysMatch[]) {
    matchByPid.set(m.rohlik_product_id, m);
  }
  const defaultPct = settings.data?.default_min_discount_pct ?? 0;

  return (
    <div className="space-y-6">
      <AddItemCard defaultMinDiscountPct={defaultPct} />

      {matches.data && matches.data.length > 0 ? (
        <div className="rounded-lg border border-rohlik-yellow bg-yellow-50 p-3 text-sm">
          Dnes je ve slevě <b>{matches.data.length}</b>{" "}
          {matches.data.length === 1 ? "položka" : "položek"} z tvého seznamu.
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-600">
          Můj seznam ({wishlist.length})
        </h2>
        {wishlist.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-gray-500">
            Zatím nic. Vlož odkaz z Rohlíku nahoře a přidej první položku.
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {wishlist.map((it) => (
              <WishlistRow
                key={it.id}
                item={it}
                match={matchByPid.get(it.rohlik_product_id) ?? null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
