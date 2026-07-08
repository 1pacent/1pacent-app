"use client";

import { useState, useTransition } from "react";
import { decideApprovalAction } from "./actions";

export function ApprovalPanel({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"approve" | "decline" | null>(null);
  const [pending, startTransition] = useTransition();

  if (decided) {
    return (
      <p className="mt-2 text-sm font-medium text-brand-700">
        {decided === "approve" ? "Approved — dispatching to tradies…" : "Declined ✓"}
      </p>
    );
  }

  function decide(decision: "approve" | "decline") {
    setError(null);
    startTransition(async () => {
      const result = await decideApprovalAction(requestId, decision);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDecided(decision);
    });
  }

  return (
    <div className="mt-3">
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide("approve")}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("decline")}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
