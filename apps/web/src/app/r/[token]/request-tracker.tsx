"use client";

import { useState, useTransition } from "react";
import { confirmFixedAction } from "./actions";

/** Display-ready only — no @1pacent/core import here, same rule as every
 * other "use client" component in this app. */
export interface TrackerStep {
  label: string;
  at: string | null;
  note?: string;
}

export interface TrackerRequest {
  requestId: string;
  title: string;
  stateLabel: string;
  isWarrantyClaim: boolean;
  awaitingYourConfirmation: boolean;
  steps: TrackerStep[];
}

function formatWhen(at: string | null): string {
  if (!at) return "";
  const d = new Date(at);
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function RequestTracker({ token, requests }: { token: string; requests: TrackerRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Your requests</h2>
      <div className="space-y-3">
        {requests.map((r) => (
          <RequestCard key={r.requestId} token={token} request={r} />
        ))}
      </div>
    </div>
  );
}

function RequestCard({ token, request }: { token: string; request: TrackerRequest }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{request.title}</p>
        {request.isWarrantyClaim && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Warranty claim — no charge
          </span>
        )}
      </div>
      <ol className="mt-3 space-y-1.5 border-l-2 border-slate-100 pl-3 text-xs text-slate-500">
        {request.steps.map((s, i) => (
          <li key={i}>
            <span className="font-medium text-slate-700">{s.label}</span>
            {s.at && <span className="text-slate-400"> — {formatWhen(s.at)}</span>}
            {s.note && <span className="block text-slate-500">{s.note}</span>}
          </li>
        ))}
      </ol>
      {request.awaitingYourConfirmation && !confirmed && (
        <div className="mt-3">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await confirmFixedAction(token, request.requestId);
                if (!r.ok) {
                  setError(r.error ?? "Could not confirm.");
                  return;
                }
                setConfirmed(true);
              })
            }
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Confirming…" : "Confirm it's fixed"}
          </button>
        </div>
      )}
      {confirmed && <p className="mt-3 text-xs font-medium text-emerald-700">Confirmed ✓</p>}
    </div>
  );
}
