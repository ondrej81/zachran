"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@/lib/types";

export default function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [email, setEmail] = useState(initial.alert_email);
  const [hour, setHour] = useState(initial.alert_hour);
  const [pct, setPct] = useState(initial.default_min_discount_pct);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_email: email,
          alert_hour: hour,
          default_min_discount_pct: pct,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "save failed");
      setMsg("Uloženo.");
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(); }}
      className="space-y-4 rounded-lg border bg-white p-4"
    >
      <label className="block">
        <span className="text-sm text-gray-600">E-mail pro upozornění</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          required
        />
      </label>
      <label className="block">
        <span className="text-sm text-gray-600">
          Čas zaslání (Europe/Prague)
        </span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="mt-1 w-full rounded border px-3 py-2"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm text-gray-600">
          Výchozí minimální sleva pro nové položky:{" "}
          <span className="font-mono">{pct} %</span>
        </span>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-rohlik-ink px-4 py-2 text-white disabled:opacity-50"
        >
          Uložit
        </button>
        {msg ? <span className="text-sm text-gray-600">{msg}</span> : null}
      </div>
    </form>
  );
}
