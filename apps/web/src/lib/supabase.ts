import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase access. The service-role client bypasses RLS, so
 * it must only ever be used inside the API tier (server components,
 * server actions, route handlers) with explicit org/token scoping —
 * never import this from a client component.
 *
 * Until magic-link auth lands, the app stays in demo mode unless the
 * service key is configured (see data.ts).
 */

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.DATA_SOURCE !== "demo",
  );
}

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!supabaseConfigured()) {
    throw new Error("Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  cached ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
