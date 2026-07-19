import { NextResponse, type NextRequest } from "next/server";
import { askFelix, felixConfigured, type FelixMessage } from "@/lib/ai";

/**
 * Felix — the network's concierge (v8 R8). The widget posts the visible
 * transcript; this route relays it to the dedicated hermes-1pacent gateway
 * (Felix's agent runtime: SOUL.md persona, honcho memory, read-only ledger)
 * and returns his reply. Server-side key, honest 501 when unconfigured.
 */

export const maxDuration = 90;

const MAX_MESSAGES = 24;
const MAX_CHARS = 2000;

export async function POST(request: NextRequest) {
  if (!felixConfigured()) {
    return NextResponse.json({ ok: false, error: "Felix isn't on shift right now." }, { status: 501 });
  }
  let body: { messages?: unknown; persona?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: FelixMessage[] = raw
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string",
    )
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content.slice(0, MAX_CHARS),
    }))
    .slice(-MAX_MESSAGES);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const persona = typeof body.persona === "string" ? body.persona.slice(0, 40) : null;
  if (persona) {
    messages[messages.length - 1] = {
      role: "user",
      content: `[app visitor, persona: ${persona}] ${last.content}`,
    };
  }
  try {
    const reply = await askFelix(messages);
    return NextResponse.json({ ok: true, reply });
  } catch (e) {
    console.warn("[felix] gateway call failed:", e);
    return NextResponse.json(
      { ok: false, error: "Felix couldn't be reached — try again in a moment, or email fixitfelix@agentmail.to." },
      { status: 502 },
    );
  }
}
