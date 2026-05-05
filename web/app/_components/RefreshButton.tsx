"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "refresh failed");
      setMsg(`Zkontrolováno ${data.checked ?? "?"} produktů.`);
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {msg ? <span className="text-gray-700">{msg}</span> : null}
      <button
        onClick={refresh}
        disabled={busy}
        className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Aktualizuji…" : "Aktualizovat"}
      </button>
    </span>
  );
}
