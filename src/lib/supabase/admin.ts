import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";

// Service-role client. Server-only: bypasses RLS, so every query MUST filter by user_id.
let cached: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("adminClient used in the browser");
  if (!cached) {
    cached = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
