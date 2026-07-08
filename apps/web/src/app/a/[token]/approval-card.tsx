"use client";

import { useState, useTransition } from "react";
import { decide } from "./actions";

type Result = Awaited<ReturnType<typeof decide>>;

export function ApprovalCard({ token }: { token: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 text-center">
        <p className="text-lg font-semibold text-brand-900">
          {result.state === "approved" ? "Approved ✓" : "Declined"}
        </p>
        <p className="mt-1 text-sm text-brand-800">
          {result.state === "approved"
            ? "We'll dispatch a tradie and keep you posted with evidence at every step."
            : "Your property manager has been notified of your decision."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {result && !result.ok && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      )}
      <div className="flex gap-3">
        <button
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await decide(token, "approve")))}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await decide(token, "decline")))}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">
        Your identity is verified by this link — one tap is all it takes.
      </p>
    </div>
  );
}
