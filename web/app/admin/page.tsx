import { supabaseAdmin } from "@/lib/supabase/server";
import AdminForm from "./AdminForm";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from("warehouse_sessions")
    .select("*")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  const { data: lastRun } = await sb
    .from("scrape_runs")
    .select("started_at, ok, product_count, error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin</h1>
      <section className="space-y-2 rounded-lg border bg-white p-4">
        <h2 className="font-medium">Warehouse session</h2>
        {row ? (
          <ul className="text-sm text-gray-700">
            <li>Nahráno: {new Date(row.uploaded_at).toLocaleString("cs-CZ")}</li>
            <li>
              Healthcheck:{" "}
              <span className={row.healthcheck_ok ? "text-green-600" : "text-red-600"}>
                {row.healthcheck_ok === null ? "neznámý"
                  : row.healthcheck_ok ? "OK" : "selhal"}
              </span>
              {row.healthcheck_at ? <> (
                {new Date(row.healthcheck_at).toLocaleString("cs-CZ")}
                )</> : null}
            </li>
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Žádná session zatím nenahrána.</p>
        )}
        <AdminForm />
      </section>

      <section className="space-y-2 rounded-lg border bg-white p-4">
        <h2 className="font-medium">Poslední scrape</h2>
        {lastRun ? (
          <ul className="text-sm text-gray-700">
            <li>Začátek: {new Date(lastRun.started_at).toLocaleString("cs-CZ")}</li>
            <li>OK: {String(lastRun.ok)}</li>
            <li>Počet produktů: {lastRun.product_count ?? "–"}</li>
            {lastRun.error ? <li className="text-red-600">{lastRun.error}</li> : null}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Zatím nic.</p>
        )}
      </section>
    </div>
  );
}
