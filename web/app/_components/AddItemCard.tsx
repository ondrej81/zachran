"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Preview = {
  productId: number;
  name: string;
  imageUrl: string | null;
  slug: string | null;
  sourceUrl: string;
};

export default function AddItemCard({ defaultMinDiscountPct }: { defaultMinDiscountPct: number }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pct, setPct] = useState(defaultMinDiscountPct);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchPreview() {
    setErr(null);
    setLoading(true);
    setPreview(null);
    try {
      const r = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "preview failed");
      setPreview(data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!preview) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: preview.productId,
          name: preview.name,
          imageUrl: preview.imageUrl,
          sourceUrl: preview.sourceUrl,
          minDiscountPct: pct,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "save failed");
      setUrl("");
      setPreview(null);
      setPct(defaultMinDiscountPct);
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-medium">Přidat položku</h2>
      <p className="mb-3 text-sm text-gray-600">
        Vlož odkaz z rohlik.cz, např. <code>https://www.rohlik.cz/123-…</code>.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url && fetchPreview()}
          placeholder="https://www.rohlik.cz/…"
          className="flex-1 rounded border px-3 py-2 outline-none focus:border-rohlik-ink"
          disabled={loading}
        />
        <button
          onClick={fetchPreview}
          disabled={!url || loading}
          className="rounded bg-rohlik-ink px-4 py-2 text-white disabled:opacity-50"
        >
          Načíst
        </button>
      </div>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      {preview ? (
        <div className="mt-4 flex gap-4 rounded border bg-gray-50 p-3">
          {preview.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.imageUrl} alt="" className="h-24 w-24 rounded object-cover" />
          ) : (
            <div className="h-24 w-24 rounded bg-gray-200" />
          )}
          <div className="flex-1 space-y-2">
            <div className="font-medium">{preview.name}</div>
            <label className="block text-sm">
              Upozornit od slevy:{" "}
              <span className="font-mono">{pct} %</span>
              <input
                type="range"
                min={0}
                max={90}
                step={5}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="ml-2 w-full"
              />
            </label>
            <button
              onClick={save}
              disabled={loading}
              className="rounded bg-rohlik-yellow px-4 py-2 font-medium text-rohlik-ink disabled:opacity-50"
            >
              Přidat na seznam
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
