"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HiVisButton, Panel } from "@/components/pulse/shell";
import { useLive } from "@/components/pulse/use-live";
import type { JobOfferView } from "@/lib/data-types";
import { acceptOfferAction, setOnlineAction } from "../../actions";

/**
 * The tradie seat (Product Strategy v8 §3): go Online like a driver; jobs
 * ping with price, address and a property briefing; one tap accepts. The
 * whole back office is the phone in their pocket.
 */

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
}

interface TradeState {
  online: boolean;
  offers: JobOfferView[];
  jobs: Array<{ requestId: string; title: string; address: string; state: string }>;
  accuracy: { trustScore: number; completedJobs: number; variancePct: number | null; timeVariancePct: number | null } | null;
}

export function TradeHome({ token, name, initial }: { token: string; name: string; initial: TradeState }) {
  const [online, setOnline] = useState(initial.online);
  const [taken, setTaken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useLive("trade-all");

  const offers = initial.offers;
  const jobs = initial.jobs;

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2">
      {/* The Online toggle — the driver switch. */}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await setOnlineAction(token, !online);
            if (r.ok) {
              setOnline(r.online);
              router.refresh();
            }
          });
        }}
        className={`flex items-center justify-between rounded-2xl border p-5 transition active:scale-[0.98] ${
          online
            ? "border-mint-400/60 bg-mint-400/10"
            : "border-field-line bg-field-900"
        }`}
      >
        <div className="text-left">
          <p className="text-lg font-bold text-white">{name.split(" ")[0]}, you&apos;re {online ? "ONLINE" : "offline"}</p>
          <p className="text-xs text-white/50">
            {online ? "Jobs near you ping this screen — first accept wins." : "Flip on to catch jobs while you're on the tools."}
          </p>
        </div>
        <span
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${online ? "bg-mint-400" : "bg-field-700"}`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${online ? "left-7" : "left-1"}`}
          />
        </span>
      </button>

      {/* Pings */}
      {online && offers.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-hivis-400">
            🔔 {offers.length} job{offers.length === 1 ? "" : "s"} for you
          </p>
          {offers.map((o) => (
            <div key={o.quoteId} className="hivis-ping-in rounded-2xl border border-hivis-400/60 bg-field-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-white">{o.title}</p>
                  <p className="text-xs text-white/50">{o.propertyAddress}</p>
                  {o.slot && <p className="mt-1 text-xs font-semibold text-white/70">📅 {o.slot.label}</p>}
                </div>
                {o.payoutCents !== null && (
                  <p className="text-xl font-extrabold text-hivis-400">{dollars(o.payoutCents)}</p>
                )}
              </div>
              {o.briefing.length > 0 && (
                <p className="mt-2 rounded-xl bg-field-800 px-3 py-2 text-xs text-white/60">
                  🏠 Site briefing: {o.briefing.join(" · ")}
                </p>
              )}
              <div className="mt-3">
                <HiVisButton
                  breathe
                  disabled={pending || taken === o.quoteId}
                  onClick={() => {
                    setError(null);
                    setTaken(o.quoteId);
                    startTransition(async () => {
                      const r = await acceptOfferAction(token, o.quoteId);
                      if (r.ok && r.requestId) router.push(`/p/job/${token}/${r.requestId}`);
                      else {
                        setTaken(null);
                        setError(r.error ?? "Could not accept.");
                        router.refresh();
                      }
                    });
                  }}
                >
                  {taken === o.quoteId ? "Locking it in…" : `Accept — paid same day`}
                </HiVisButton>
              </div>
            </div>
          ))}
        </div>
      )}
      {online && offers.length === 0 && (
        <Panel>
          <p className="text-center text-sm text-white/40">Watching for jobs near you…</p>
        </Panel>
      )}

      {error && <p className="rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300">{error}</p>}

      {/* The day */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Your day</p>
        {jobs.length === 0 ? (
          <p className="text-xs text-white/30">Accepted jobs stack up here in route order.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => (
              <Link
                key={j.requestId}
                href={`/p/job/${token}/${j.requestId}`}
                className="flex items-center justify-between rounded-2xl border border-field-line bg-field-900 px-4 py-3 active:scale-[0.98]"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{j.title}</p>
                  <p className="text-xs text-white/40">{j.address}</p>
                </div>
                <span className="text-xs font-semibold text-mint-300">{String(j.state).replace(/_/g, " ")} →</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Standing */}
      {initial.accuracy && initial.accuracy.completedJobs > 0 && (
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Your standing</p>
              <p className="text-sm text-white/70">
                ±{initial.accuracy.variancePct?.toFixed(0) ?? 0}% quote accuracy
                {initial.accuracy.timeVariancePct !== null
                  ? ` · ±${initial.accuracy.timeVariancePct.toFixed(0)}% time accuracy`
                  : ""}{" "}
                · {initial.accuracy.completedJobs} job
                {initial.accuracy.completedJobs === 1 ? "" : "s"}
              </p>
            </div>
            <p className="text-2xl font-extrabold text-mint-300">{initial.accuracy.trustScore}</p>
          </div>
        </Panel>
      )}
    </div>
  );
}
