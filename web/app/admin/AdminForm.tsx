"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/session", { method: "PUT", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "upload failed");
      setMsg(
        `Nahráno (${data.cookieCount} cookies). Healthcheck: ${
          data.healthcheckOk ? "OK" : "selhal"
        } (${data.productCount} produktů na stránce).`,
      );
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/session?action=healthcheck", { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "healthcheck failed");
      setMsg(`Healthcheck: ${data.ok ? "OK" : "selhal"} (${data.productCount} produktů)`);
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 pt-2">
      <form onSubmit={upload} className="flex items-center gap-2">
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          required
          className="text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-rohlik-ink px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Nahrát session JSON
        </button>
      </form>
      <button
        onClick={recheck}
        disabled={busy}
        className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Re-run healthcheck
      </button>
      {msg ? <p className="text-sm text-gray-700">{msg}</p> : null}
    </div>
  );
}
