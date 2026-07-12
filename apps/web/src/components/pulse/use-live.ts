"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The live wire (Developer Brief v8 §3): subscribe to a broadcast topic and
 * refresh the projection when the world changes. The payload is only a poke
 * — data always refetches through the token-scoped server path. Without
 * realtime credentials (demo mode), fall back to a 3s poll: the degraded
 * ladder gains a rung, loses nothing.
 */

let client: SupabaseClient | null | undefined;

function anonClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function useLive(topic: string, onPoke?: () => void): void {
  const router = useRouter();
  const cb = useRef(onPoke);
  cb.current = onPoke;

  useEffect(() => {
    const refresh = () => (cb.current ? cb.current() : router.refresh());
    const supabase = anonClient();
    if (supabase) {
      const channel = supabase
        .channel(topic, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: "poke" }, refresh)
        .subscribe();
      // Belt-and-braces slow poll in case a poke is missed.
      const slow = setInterval(refresh, 20_000);
      return () => {
        clearInterval(slow);
        void supabase.removeChannel(channel);
      };
    }
    const id = setInterval(refresh, 3_000);
    return () => clearInterval(id);
  }, [topic, router]);
}
