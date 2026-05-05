import { supabaseAdmin } from "@/lib/supabase/server";
import type { Settings } from "@/lib/types";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("settings").select("*").eq("id", 1).single();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nastavení</h1>
      <SettingsForm initial={(data ?? {
        id: 1, alert_email: "", alert_hour: 7,
        default_min_discount_pct: 0, warehouse_label: null,
        updated_at: new Date().toISOString(),
      }) as Settings} />
    </div>
  );
}
