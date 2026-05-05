import { supabaseAdmin } from "@/lib/supabase/server";
import type { WishlistItem } from "@/lib/types";
import AddItemCard from "./_components/AddItemCard";
import WishlistRow from "./_components/WishlistRow";
import RefreshButton from "./_components/RefreshButton";

export const dynamic = "force-dynamic";

function isMatch(item: WishlistItem): boolean {
  return (
    item.last_sale_price !== null &&
    item.last_discount_pct !== null &&
    item.last_discount_pct >= item.min_discount_pct
  );
}

export default async function Home() {
  const sb = supabaseAdmin();
  const [items, settings] = await Promise.all([
    sb.from("wishlist_items").select("*").order("created_at", { ascending: false }),
    sb.from("settings").select("*").eq("id", 1).single(),
  ]);

  const wishlist = (items.data ?? []) as WishlistItem[];
  const defaultPct = settings.data?.default_min_discount_pct ?? 0;
  const matchCount = wishlist.filter(isMatch).length;
  const lastCheck = wishlist
    .map((w) => w.last_check_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <AddItemCard defaultMinDiscountPct={defaultPct} />

      {matchCount > 0 ? (
        <div className="rounded-lg border border-rohlik-yellow bg-yellow-50 p-3 text-sm">
          Dnes je ve slevě <b>{matchCount}</b>{" "}
          {matchCount === 1 ? "položka" : matchCount < 5 ? "položky" : "položek"} z tvého seznamu.
        </div>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-gray-600">
            Můj seznam ({wishlist.length})
          </h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {lastCheck ? (
              <span>
                Naposledy zkontrolováno: {new Date(lastCheck).toLocaleString("cs-CZ")}
              </span>
            ) : null}
            <RefreshButton />
          </div>
        </div>
        {wishlist.length === 0 ? (
          <div className="rounded-lg border bg-white p-6 text-center text-gray-500">
            Zatím nic. Vlož odkaz z Rohlíku nahoře a přidej první položku.
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {wishlist.map((it) => (
              <WishlistRow key={it.id} item={it} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
