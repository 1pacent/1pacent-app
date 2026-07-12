"use client";

import { useState, useTransition } from "react";
import { setAutoQuoteAction } from "./actions";

/**
 * Nelly's auto-quote settings (Product Design v6 §4.4): opt-in, bounded,
 * revocable. When enabled, a matching invite gets the tradie's standard
 * rate-card quote submitted instantly — every submission attributed and
 * visible in the quote round.
 */
export function AutoQuoteForm({
  token,
  initial,
}: {
  token: string;
  initial: { enabled: boolean; maxTotalCents: number | null };
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [cap, setCap] = useState(initial.maxTotalCents !== null ? String(initial.maxTotalCents / 100) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Auto-quote (Nelly)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Submit my standard rate-card quote the instant an invite lands — win jobs while I&apos;m on the
            tools. Every auto-submission is attributed and visible; switch it off any time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEnabled((v) => !v);
            setSaved(false);
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand-600" : "bg-slate-300"}`}
          aria-pressed={enabled}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <label className="flex-1 text-xs font-medium text-slate-600">
          Never auto-quote above (total $, blank = no cap)
          <input
            value={cap}
            onChange={(e) => {
              setCap(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. 500"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await setAutoQuoteAction(token, enabled, cap);
              if (result.ok) setSaved(true);
              else setError(result.error ?? "Could not save.");
            });
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
