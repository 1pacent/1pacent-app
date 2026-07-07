import "server-only";
import type { DataSource } from "./data-types";
import { supabaseConfigured } from "./supabase";
import { demoData } from "./store";

/**
 * Data-source dispatch. Supabase becomes the backend as soon as
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured
 * (set DATA_SOURCE=demo to force the seeded demo org regardless).
 *
 * NOTE: the Supabase path is for internal testing until magic-link auth
 * lands — the dashboard is not org-scoped per user yet.
 */
export async function getData(): Promise<DataSource> {
  if (supabaseConfigured()) {
    const { supabaseData } = await import("./supabase-data");
    return supabaseData;
  }
  return demoData;
}
