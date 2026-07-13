"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BatchableComplianceGroup } from "@/lib/data-types";
import { dispatchBatchAction } from "@/app/p/actions";

/**
 * George's batch runs on the Deck (Developer Brief v8 §8 R2): same-suburb
 * compliance checks bundled into one dispatch — one tap, one negotiated
 * route, certificates file on completion. The PM is the human actor.
 */
export function BatchCard({ token, group }: { token: string; group: BatchableComplianceGroup }) {
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="hivis-ping-in rounded-2xl border border-hivis-400/50 bg-field-900 p-4">
      <p className="font-bold text-white">
        {group.requirementName} · {group.propertyAddresses.length} doors in {group.suburb}
      </p>
      <p className="mt-1 text-xs text-white/50">
        {group.propertyAddresses.join(" · ")} — due {new Date(group.windowEnd).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
      </p>
      {done !== null ? (
        <p className="mt-3 rounded-xl bg-mint-400/15 px-3 py-2 text-center text-sm font-bold text-mint-300">
          Batched — {done} job{done === 1 ? "" : "s"} dispatched ✓
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await dispatchBatchAction(token, {
                requirementKey: group.requirementKey,
                suburb: group.suburb,
              });
              if (r.ok) {
                setDone(r.dispatched ?? group.propertyAddresses.length);
                router.refresh();
              } else setError(r.error ?? "Could not dispatch the batch.");
            });
          }}
          className="mt-3 w-full rounded-xl bg-hivis-400 px-4 py-2.5 text-sm font-bold text-field-950 active:scale-[0.97]"
        >
          {pending ? "Dispatching…" : "Batch them"}
        </button>
      )}
      {error && <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
