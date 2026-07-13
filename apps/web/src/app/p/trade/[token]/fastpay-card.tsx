"use client";

import { useState, useTransition } from "react";
import { setFastPayAction } from "@/app/p/actions";

/**
 * Fast-Pay (v8 R3): the tradie chooses money-today. The 2% factoring fee is
 * stated plainly and comes off the payout; the platform carries no credit
 * risk (a funding partner's balance sheet does — Monetisation.md).
 */
export function FastPayCard({ token, initialEnabled }: { token: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-field-line bg-field-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-white">Fast-Pay</p>
          <p className="text-xs text-white/40">
            {enabled ? "Payouts land same-day — 2% comes off the payout." : "Standard payout on verification, no fee."}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            setError(null);
            startTransition(async () => {
              const r = await setFastPayAction(token, next);
              if (!r.ok) {
                setEnabled(!next);
                setError(r.error ?? "Could not save.");
              }
            });
          }}
          className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? "bg-hivis-400" : "bg-white/15"}`}
          aria-label="Toggle Fast-Pay"
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${enabled ? "left-[calc(100%-1.625rem)]" : "left-0.5"}`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
