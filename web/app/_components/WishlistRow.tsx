"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WishlistItem } from "@/lib/types";

function appendLm(url: string): string {
  return url.includes("?") ? `${url}&lm=1` : `${url}?lm=1`;
}

export default function WishlistRow({ item }: { item: WishlistItem }) {
  const router = useRouter();
  const [pct, setPct] = useState(item.min_discount_pct);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const onSale =
    item.last_sale_price !== null &&
    item.last_discount_pct !== null;
  const aboveThreshold =
    onSale && item.last_discount_pct! >= item.min_discount_pct;

  async function patch(newPct: number) {
    setBusy(true);
    try {
      await fetch("/api/wishlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, minDiscountPct: newPct }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Odstranit "${item.name}" ze seznamu?`)) return;
    setBusy(true);
    try {
      await fetch("/api/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3 p-3">
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded object-cover" />
      ) : (
        <div className="h-16 w-16 flex-shrink-0 rounded bg-gray-200" />
      )}

      <div className="min-w-0 flex-1">
        <a
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-medium hover:underline"
        >
          {item.name}
        </a>

        {aboveThreshold ? (
          <a
            href={appendLm(item.source_url)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block rounded bg-rohlik-yellow px-2 py-0.5 text-sm font-medium hover:underline"
          >
            Dnes sleva −{item.last_discount_pct} % · {item.last_sale_price?.toFixed(2)} Kč
            {item.last_original_price ? (
              <span className="ml-2 text-gray-600 line-through">
                {item.last_original_price.toFixed(2)} Kč
              </span>
            ) : null}
          </a>
        ) : onSale ? (
          <div className="mt-1 text-sm text-gray-500">
            Ve slevě jen −{item.last_discount_pct} %, pod tvojí hranicí.
          </div>
        ) : item.last_check_error ? (
          <div className="mt-1 text-sm text-red-600">
            Kontrola se nezdařila ({item.last_check_error}).
          </div>
        ) : item.last_check_at ? (
          <div className="mt-1 text-sm text-gray-500">Dnes není ve slevě.</div>
        ) : (
          <div className="mt-1 text-sm text-gray-400">Ještě nezkontrolováno.</div>
        )}

        {editing ? (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span>od</span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-32"
            />
            <span className="font-mono">{pct} %</span>
            <button
              onClick={() => patch(pct)}
              disabled={busy}
              className="ml-auto rounded bg-rohlik-ink px-3 py-1 text-white disabled:opacity-50"
            >
              Uložit
            </button>
            <button
              onClick={() => { setEditing(false); setPct(item.min_discount_pct); }}
              className="text-gray-500"
            >
              Zrušit
            </button>
          </div>
        ) : (
          <div className="mt-1 text-xs text-gray-500">
            Upozornit od {item.min_discount_pct} %{" "}
            <button onClick={() => setEditing(true)} className="ml-1 text-blue-600 hover:underline">
              změnit
            </button>
          </div>
        )}
      </div>

      <button
        onClick={remove}
        disabled={busy}
        aria-label="Odstranit"
        className="self-start text-gray-400 hover:text-red-600 disabled:opacity-50"
      >
        ×
      </button>
    </li>
  );
}
