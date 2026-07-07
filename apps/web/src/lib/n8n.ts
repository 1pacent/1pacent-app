import "server-only";

/**
 * n8n is an internal worker only (docs/ARCHITECTURE.md rule 5) — the API
 * tier calls it after already committing state, never the reverse, and
 * every webhook must carry header auth. If N8N_INTERNAL_URL/AUTH_TOKEN
 * aren't configured (demo mode, or before the workflows are provisioned),
 * calls no-op with a console warning rather than failing the request —
 * the DB state change (quote dispatch, acceptance) already succeeded and
 * is the source of truth; the email is a side effect.
 */

export interface DispatchQuotesPayload {
  requestId: string;
  property: { address: string };
  request: { title: string; description: string };
  invites: Array<{ quoteId: string; tradieName: string; tradieEmail: string; quoteUrl: string }>;
}

export interface DispatchNotifyPayload {
  requestId: string;
  accepted: { tradieName: string; tradieEmail: string; quoteCents: number; callOutFeeCents: number };
  declined: Array<{ tradieName: string; tradieEmail: string }>;
}

function n8nConfig(): { baseUrl: string; authToken: string } | null {
  const baseUrl = process.env.N8N_INTERNAL_URL;
  const authToken = process.env.N8N_INTERNAL_AUTH_TOKEN;
  if (!baseUrl || !authToken) return null;
  return { baseUrl, authToken };
}

export async function triggerDispatchQuotes(payload: DispatchQuotesPayload): Promise<void> {
  await postWebhook("1pacent-sally-dispatch-quotes", payload);
}

export async function triggerDispatchNotify(payload: DispatchNotifyPayload): Promise<void> {
  await postWebhook("1pacent-sally-dispatch-notify", payload);
}

async function postWebhook(path: string, payload: unknown): Promise<void> {
  const config = n8nConfig();
  if (!config) {
    console.warn(`[n8n] N8N_INTERNAL_URL/N8N_INTERNAL_AUTH_TOKEN not set — skipping "${path}" notification.`);
    return;
  }
  const res = await fetch(`${config.baseUrl}/webhook/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Auth": config.authToken },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`n8n webhook "${path}" failed (${res.status}): ${body}`);
  }
}
