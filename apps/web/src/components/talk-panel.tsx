"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seatMessageAction } from "@/app/canvas-actions";
import type { SeatMode } from "@/lib/sally-seat";

/**
 * The Talk surface for the seat personas (owner / PM / tradie): Sally,
 * graph-scoped by the token, answering only through scoped tools over the
 * ledger. Decisions never happen here — Sally points at the board. When the
 * LLM is down the honest banner shows and the canvas is untouched.
 */

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

const OPENERS: Record<SeatMode, string> = {
  owner_portal:
    "Hi, I'm Sally. Ask me anything about your properties — spending, upcoming work, compliance, reports. Everything I say comes straight from your ledger.",
  pm_portfolio:
    "Hi, I'm Sally. Ask me about the portfolio — what's due next quarter, which properties are red, what can be batched.",
  tradie_portal:
    "Hi, I'm Sally. Ask about your day, your jobs, or how accurate your quotes have been lately.",
};

const SUGGESTIONS: Record<SeatMode, string[]> = {
  owner_portal: ["What have I spent this year?", "Anything I should plan for?", "Get me the data pack for my accountant"],
  pm_portfolio: ["What's due across the portfolio next quarter?", "Which properties are red right now?"],
  tradie_portal: ["What's my day look like?", "How accurate was I last month?"],
};

export function TalkPanel({ mode, token }: { mode: SeatMode; token: string }) {
  const [messages, setMessages] = useState<ChatEntry[]>([{ role: "assistant", content: OPENERS[mode] }]);
  const [input, setInput] = useState("");
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    const history = messages
      .slice(1) // drop the canned opener
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setInput("");
    startTransition(async () => {
      const result = await seatMessageAction(mode, token, history, trimmed);
      if (!result.ok) {
        if (result.error?.includes("offline")) setOffline(true);
        else setError(result.error ?? "Something went wrong — try again.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: result.reply ?? "", toolsUsed: result.toolsUsed }]);
      // A tool may have generated a report card — refresh the board.
      if (result.toolsUsed && result.toolsUsed.length > 0) router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {offline && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sally&apos;s offline — everything below still works.
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900"
              }`}
            >
              {m.content}
            </div>
            {m.toolsUsed && m.toolsUsed.length > 0 && (
              <p className="mt-1 text-[10px] text-slate-400">
                checked the ledger: {m.toolsUsed.map((t) => t.replace(/_/g, " ")).join(", ")}
              </p>
            )}
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">
              Sally is checking the ledger…
            </div>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {messages.length === 1 && !offline && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS[mode].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-brand-400 hover:text-brand-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!offline && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Sally…"
            disabled={pending}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={pending || !input.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
