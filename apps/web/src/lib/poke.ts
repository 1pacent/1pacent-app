import "server-only";

/**
 * Server-side realtime poke: after a mutation commits, nudge every client
 * watching the topic to refetch its scoped projection. Fire-and-forget —
 * the ledger is truth; this is delivery, not state. No-op without Supabase.
 */
export async function poke(topic: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic, event: "poke", payload: {} }] }),
    });
  } catch (e) {
    console.warn("[poke] broadcast failed (clients will poll):", e);
  }
}

export function jobTopic(requestId: string): string {
  return `job-${requestId}`;
}

export function tradeTopic(tradieContactId?: string): string {
  // R1: one shared trade topic — offers are re-fetched scoped per token anyway.
  return tradieContactId ? `trade-${tradieContactId}` : "trade-all";
}
