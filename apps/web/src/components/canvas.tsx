"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CanvasCard, CanvasCardData } from "@/lib/data-types";
import {
  confirmFixedFromCanvasAction,
  confirmSlotAction,
  dispatchBatchAction,
  ownerAcceptQuoteAction,
  ownerDecideAction,
} from "@/app/canvas-actions";

/**
 * The See/Act surface (Product Design v6 §2): a live stream of typed cards,
 * deterministic projections of DB state. Actions live HERE, not in chat —
 * every tap is a token-scoped server action with a human actor. Refreshes
 * every 15 s (honest copy below; SSE is phase 2).
 */

export type CanvasScope = "tenant" | "owner" | "pm" | "tradie";

const STATE_STYLES: Record<CanvasCard["state"], { chip: string; label: string }> = {
  needs_you: { chip: "bg-gold-100 text-gold-900 border-gold-300", label: "Needs you" },
  live: { chip: "bg-brand-50 text-brand-800 border-brand-200", label: "Live" },
  done: { chip: "bg-slate-100 text-slate-600 border-slate-200", label: "Done" },
  info: { chip: "bg-slate-50 text-slate-500 border-slate-200", label: "" },
};

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

export function Canvas({ cards, token, scope }: { cards: CanvasCard[]; token: string; scope: CanvasScope }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [router]);

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nothing on the board yet — it fills up as things happen.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-right text-[11px] text-slate-400">updates every few seconds</p>
      {cards.map((card) => (
        <CardShell key={card.id} card={card} token={token} scope={scope} onDone={() => router.refresh()} />
      ))}
    </div>
  );
}

function CardShell({
  card,
  token,
  scope,
  onDone,
}: {
  card: CanvasCard;
  token: string;
  scope: CanvasScope;
  onDone: () => void;
}) {
  const style = STATE_STYLES[card.state];
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${card.state === "needs_you" ? "border-gold-300 ring-1 ring-gold-200" : "border-slate-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-slate-900">{card.title}</h3>
        {style.label && (
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${style.chip}`}>
            {style.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">{card.body}</p>
      <CardBody data={card.data} token={token} scope={scope} onDone={onDone} />
      <div className="mt-3 flex items-center justify-between">
        <Link href={card.workspaceHref} className="text-xs font-medium text-brand-700 hover:underline">
          Open in workspace →
        </Link>
        <span className="text-[11px] text-slate-400">{new Date(card.at).toLocaleDateString("en-AU")}</span>
      </div>
    </div>
  );
}

function CardBody({
  data,
  token,
  scope,
  onDone,
}: {
  data: CanvasCardData;
  token: string;
  scope: CanvasScope;
  onDone: () => void;
}) {
  switch (data.kind) {
    case "slot_confirm":
      return <SlotConfirm data={data} token={token} onDone={onDone} />;
    case "confirm_fixed":
      return <ConfirmFixed data={data} token={token} onDone={onDone} />;
    case "approval":
      return scope === "owner" ? <OwnerApproval data={data} token={token} onDone={onDone} /> : null;
    case "batch_offer":
      return scope === "pm" ? <BatchOffer data={data} token={token} onDone={onDone} /> : null;
    case "obligations":
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Month by month</summary>
          <div className="mt-2 space-y-2">
            {data.months.map((m) => (
              <div key={m.month}>
                <p className="text-xs font-semibold text-slate-700">{m.month}</p>
                <ul className="mt-0.5 list-disc pl-5 text-xs text-slate-600">
                  {m.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      );
    case "insight":
    case "crew_activity":
      return data.lines.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Details</summary>
          <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
            {data.lines.map((line, i) => (
              <li key={i} className={line.startsWith("  ·") ? "pl-4 text-slate-400" : ""}>
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null;
    default:
      return null;
  }
}

function ActionError({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>;
}

function SlotConfirm({
  data,
  token,
  onDone,
}: {
  data: Extract<CanvasCardData, { kind: "slot_confirm" }>;
  token: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  if (confirmed) {
    return <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">Locked in: {confirmed} ✓</p>;
  }
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {data.options.map((opt, i) => (
          <button
            key={opt.startAt}
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await confirmSlotAction(token, data.workOrderId, i);
                if (result.ok) {
                  setConfirmed(opt.label);
                  onDone();
                } else setError(result.error ?? "Could not confirm that slot.");
              });
            }}
            className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
      <ActionError error={error} />
    </div>
  );
}

function ConfirmFixed({
  data,
  token,
  onDone,
}: {
  data: Extract<CanvasCardData, { kind: "confirm_fixed" }>;
  token: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">Confirmed — thanks! ✓</p>;
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await confirmFixedFromCanvasAction(token, data.requestId);
            if (result.ok) {
              setDone(true);
              onDone();
            } else setError(result.error ?? "Could not confirm.");
          });
        }}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Yes, it&apos;s fixed
      </button>
      <ActionError error={error} />
    </div>
  );
}

function OwnerApproval({
  data,
  token,
  onDone,
}: {
  data: Extract<CanvasCardData, { kind: "approval" }>;
  token: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  if (outcome) {
    return <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">{outcome} ✓</p>;
  }

  // Quote pick: ranked options, recommended on top with the working shown.
  if (data.quotes.length > 0) {
    return (
      <div className="mt-3 space-y-2">
        {data.quotes.map((q) => (
          <div
            key={q.quoteId}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${q.recommended ? "border-brand-300 bg-brand-50" : "border-slate-200"}`}
          >
            <div>
              <p className="text-sm font-medium text-slate-900">
                {q.tradieName}
                {q.recommended && (
                  <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Recommended
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                {centsToDollars(q.totalCents)} total · trust {q.trustScore}/100
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await ownerAcceptQuoteAction(token, data.requestId, q.quoteId);
                  if (result.ok) {
                    setOutcome(`${q.tradieName} accepted`);
                    onDone();
                  } else setError(result.error ?? "Could not accept that quote.");
                });
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Accept
            </button>
          </div>
        ))}
        <ActionError error={error} />
      </div>
    );
  }

  // Intake-gate approve/decline.
  return (
    <div className="mt-3 flex gap-2">
      {(["approve", "decline"] as const).map((decision) => (
        <button
          key={decision}
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await ownerDecideAction(token, data.requestId, decision);
              if (result.ok) {
                setOutcome(decision === "approve" ? "Approved — getting quotes" : "Declined");
                onDone();
              } else setError(result.error ?? "Could not record that decision.");
            });
          }}
          className={
            decision === "approve"
              ? "rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              : "rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          }
        >
          {decision === "approve" ? "Approve" : "Decline"}
        </button>
      ))}
      <ActionError error={error} />
    </div>
  );
}

function BatchOffer({
  data,
  token,
  onDone,
}: {
  data: Extract<CanvasCardData, { kind: "batch_offer" }>;
  token: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<number | null>(null);

  if (dispatched !== null) {
    return (
      <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800">
        Batch dispatched — {dispatched} quote round{dispatched === 1 ? "" : "s"} under way ✓
      </p>
    );
  }
  return (
    <div className="mt-3">
      <ul className="mb-2 list-disc pl-5 text-xs text-slate-600">
        {data.propertyAddresses.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await dispatchBatchAction(token, data.requirementKey, data.suburb);
            if (result.ok) {
              setDispatched(result.dispatched ?? 0);
              onDone();
            } else setError(result.error ?? "Could not dispatch the batch.");
          });
        }}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Dispatching…" : "Get this batch quoted"}
      </button>
      <ActionError error={error} />
    </div>
  );
}
