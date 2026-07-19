"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Felix — the floating concierge (v8 R8). One gold button on every persona
 * surface; opens a small chat that talks to /api/felix (the hermes-1pacent
 * gateway). Felix greets, answers product questions, and triages — he is
 * NOT Sally: lodging a repair still happens through the app flow.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING =
  "G'day — Felix here, 1Pacent's concierge. Ask me anything about how the network works, your jobs, or where to go next.";

function personaFromPath(pathname: string): string {
  if (pathname.startsWith("/p/fix")) return "renter";
  if (pathname.startsWith("/p/own")) return "owner";
  if (pathname.startsWith("/p/deck")) return "property manager";
  if (pathname.startsWith("/p/trade")) return "tradie";
  if (pathname.startsWith("/site")) return "website visitor";
  return "app visitor";
}

export function FelixWidget({ persona, theme = "dark" }: { persona?: string; theme?: "dark" | "light" }) {
  const pathname = usePathname();
  const resolvedPersona = persona ?? personaFromPath(pathname ?? "");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/felix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(1), persona: resolvedPersona }),
      });
      const json = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: json.ok && json.reply ? json.reply : (json.error ?? "Something went sideways — try again?") },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Felix couldn't be reached — try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  const dark = theme === "dark";
  const panelBg = dark ? "bg-field-900 border-field-line text-white" : "bg-white border-slate-200 text-slate-900";
  const botBubble = dark ? "bg-field-950 border border-field-line" : "bg-slate-100";
  const userBubble = dark ? "bg-hivis-400 text-field-950" : "bg-brand-600 text-white";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className={`flex h-[26rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelBg}`}>
          <div className="flex items-center justify-between border-b border-inherit px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Felix</div>
              <div className={`text-xs ${dark ? "text-white/50" : "text-slate-500"}`}>1Pacent concierge</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Felix" className="text-xl leading-none opacity-60">
              ×
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? `ml-auto ${userBubble}` : botBubble}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className={`w-fit rounded-xl px-3 py-2 text-sm ${botBubble} animate-pulse`}>…</div>}
          </div>
          <form
            className="flex gap-2 border-t border-inherit p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Felix…"
              className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none ${dark ? "bg-field-950 border border-field-line placeholder:text-white/40" : "bg-slate-100"}`}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="rounded-xl bg-hivis-400 px-3 py-2 text-sm font-semibold text-field-950 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Felix"
        className="flex items-center gap-2 rounded-full bg-hivis-400 px-4 py-3 text-sm font-semibold text-field-950 shadow-lg transition active:scale-95"
      >
        🛠️ {open ? "Close" : "Ask Felix"}
      </button>
    </div>
  );
}
