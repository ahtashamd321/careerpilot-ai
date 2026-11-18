import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import type { Profile, Settings } from "./types";

/** Loads profile + settings, creating defaults on first use. Works with RLS or admin clients. */
export async function loadProfileAndSettings(db: SupabaseClient, userId: string): Promise<{ profile: Profile; settings: Settings }> {
  let { data: profile } = await db.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (!profile) {
    const { data, error } = await db.from("profiles").upsert({ user_id: userId, ...DEFAULT_PROFILE }).select().single();
    if (error) throw new Error(`Could not create profile: ${error.message}`);
    profile = data;
  }
  let { data: settings } = await db.from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (!settings) {
    const { data, error } = await db.from("settings").upsert({ user_id: userId, ...DEFAULT_SETTINGS }).select().single();
    if (error) throw new Error(`Could not create settings: ${error.message}`);
    settings = data;
  }
  settings.sources = { ...DEFAULT_SETTINGS.sources, ...(settings.sources ?? {}) };
  return { profile: profile as Profile, settings: settings as Settings };
}
