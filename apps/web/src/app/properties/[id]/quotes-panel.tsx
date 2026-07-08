"use client";

import { useState, useTransition } from "react";
import { acceptQuoteAction } from "./actions";

/** Display-ready only — no @1pacent/core import here. That barrel re-exports
 * tokens.ts (node:crypto), which breaks the client bundle if pulled in from
 * a "use client" component. Formatting/classification happens server-side
 * in page.tsx; this component just renders the resulting strings. */
export interface QuotesPanelQuote {
  quoteId: string;
  tradieName: string;
  status: string;
  totalDisplay: string | null;
  quoteDisplay: string | null;
  calloutDisplay: string | null;
  note: string | null;
  trustTier: "unproven" | "reliable" | "needs_review";
  /** 1-based rank from the trust/cost/availability composite score — only set once submitted+priced. */
  rank?: number;
}

const TRUST_LABEL: Record<QuotesPanelQuote["trustTier"], string> = {
  unproven: "Unproven",
  reliable: "Reliable",
  needs_review: "Needs review",
};

const TRUST_CLASS: Record<QuotesPanelQuote["trustTier"], string> = {
  unproven: "bg-slate-100 text-slate-600",
  reliable: "bg-emerald-100 text-emerald-700",
  needs_review: "bg-amber-100 text-amber-700",
};

export function QuotesPanel({ requestId, quotes }: { requestId: string; quotes: QuotesPanelQuote[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [, startTransition] = useTransition();

  if (accepted) {
    return <p className="mt-2 text-sm font-medium text-emerald-700">Tradie dispatched ✓</p>;
  }

  function accept(quoteId: string) {
    setPendingId(quoteId);
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(requestId, quoteId);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not accept this quote.");
        return;
      }
      setAccepted(true);
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {quotes.map((q) => (
          <div
            key={q.quoteId}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                {q.rank === 1 && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                    Top pick
                  </span>
                )}
                {q.rank !== undefined && q.rank !== 1 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                    #{q.rank}
                  </span>
                )}
                <span className="font-medium text-slate-900">{q.tradieName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRUST_CLASS[q.trustTier]}`}>
                  {TRUST_LABEL[q.trustTier]}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {q.status === "invited" && "Waiting on their quote…"}
                {q.status === "submitted" &&
                  `${q.totalDisplay ?? "—"} (${q.quoteDisplay ?? "—"} + ${q.calloutDisplay ?? "—"} call-out)${
                    q.note ? ` — ${q.note}` : ""
                  }`}
                {q.status === "accepted" && "Accepted"}
                {q.status === "not_selected" && "Not selected"}
              </p>
            </div>
            {q.status === "submitted" && (
              <button
                type="button"
                onClick={() => accept(q.quoteId)}
                disabled={pendingId !== null}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pendingId === q.quoteId ? "Dispatching…" : "Accept"}
              </button>
            )}
          </div>
      ))}
    </div>
  );
}
