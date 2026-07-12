"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CanvasCard } from "@/lib/data-types";
import { confirmSlotAction, ownerAcceptQuoteAction, ownerDecideAction } from "@/app/canvas-actions";

/** A Moment: one decision, one tap, a human actor in the ledger. */
export function MomentCard({ card, token }: { card: CanvasCard; token: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setDone(label);
        router.refresh();
      } else setError(r.error ?? "Could not do that.");
    });
  }

  return (
    <div className="hivis-ping-in rounded-2xl border border-hivis-400/50 bg-field-900 p-4">
      <p className="font-bold text-white">{card.title}</p>
      <p className="mt-1 text-xs text-white/50">{card.body}</p>

      {done ? (
        <p className="mt-3 rounded-xl bg-mint-400/15 px-3 py-2 text-center text-sm font-bold text-mint-300">
          {done} ✓
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {card.data.kind === "approval" && card.data.quotes.length === 0 && (
            <div className="flex gap-2">
              {(["approve", "decline"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const reqId = card.data.kind === "approval" ? card.data.requestId : "";
                    run(d === "approve" ? "Approved" : "Declined", () => ownerDecideAction(token, reqId, d));
                  }}
                  className={
                    d === "approve"
                      ? "flex-1 rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97]"
                      : "flex-1 rounded-xl border border-field-line px-4 py-2.5 text-sm font-semibold text-white/60 active:scale-[0.97]"
                  }
                >
                  {d === "approve" ? "Approve" : "Decline"}
                </button>
              ))}
            </div>
          )}
          {card.data.kind === "approval" &&
            card.data.quotes.map((q) => (
              <button
                key={q.quoteId}
                type="button"
                disabled={pending}
                onClick={() => {
                  const reqId = card.data.kind === "approval" ? card.data.requestId : "";
                  run(`${q.tradieName} accepted`, () => ownerAcceptQuoteAction(token, reqId, q.quoteId));
                }}
                className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm active:scale-[0.97] ${
                  q.recommended
                    ? "border-hivis-400 bg-hivis-400/10 font-bold text-hivis-400"
                    : "border-field-line text-white/70"
                }`}
              >
                <span>
                  {q.tradieName}
                  {q.recommended ? " · recommended" : ""}
                </span>
                <span>${Math.round(q.totalCents / 100)}</span>
              </button>
            ))}
          {card.data.kind === "slot_confirm" &&
            card.data.options.map((opt, i) => {
              const woId = card.data.kind === "slot_confirm" ? card.data.workOrderId : "";
              return (
                <button
                  key={opt.startAt}
                  type="button"
                  disabled={pending}
                  onClick={() => run(`Locked in ${opt.label}`, () => confirmSlotAction(token, woId, i))}
                  className="rounded-xl border border-hivis-400/60 px-4 py-2.5 text-sm font-semibold text-hivis-400 active:scale-[0.97]"
                >
                  {opt.label}
                </button>
              );
            })}
          {card.data.kind === "batch_offer" && (
            <p className="text-xs text-white/40">Batch dispatch lives on the manager&apos;s deck.</p>
          )}
        </div>
      )}
      {error && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
