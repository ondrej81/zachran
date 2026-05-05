import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let _client: SupabaseClient | undefined;

// Service-role client. Server-only — never expose to the browser.
export function supabaseAdmin() {
  if (_client) return _client;
  const e = env();
  _client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
