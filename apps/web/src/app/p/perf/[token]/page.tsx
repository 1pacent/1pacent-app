import Link from "next/link";
import { getData } from "@/lib/data";
import { Panel, PulseTopBar } from "@/components/pulse/shell";
import { RespondBox } from "./respond-box";

export const dynamic = "force-dynamic";

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-AU")}`;
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/**
 * The performance page (v8 R6): ONE read model, three persona projections —
 * a tradie's business, a PM's portfolio, an owner's properties. The
 * commonality IS the design: same tiles, same activity feed, same warranty
 * ledger; only the scope changes.
 */
export default async function PerfPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const perf = await (await getData()).getPerformance(token);

  if (!perf) {
    return (
      <>
        <PulseTopBar back="/p" />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">This link isn&apos;t active</h1>
        </div>
      </>
    );
  }

  const backHref = perf.scope === "tradie" ? `/p/trade/${token}` : perf.scope === "pm" ? `/p/deck/${token}` : `/p/own/${token}`;

  return (
    <>
      <PulseTopBar back={backHref} title="Performance" />
      <div className="flex flex-col gap-4 pt-2 pb-8">
        <h1 className="font-serif text-2xl font-semibold">{perf.heading}</h1>

        {/* Tiles */}
        <div className="grid grid-cols-2 gap-2">
          {perf.tiles.map((t) => (
            <div key={t.label} className="rounded-2xl border border-field-line bg-field-900 p-3">
              <p className="text-[9px] uppercase tracking-widest text-white/40">{t.label}</p>
              <p className="mt-0.5 text-2xl font-extrabold text-white">{t.value}</p>
              {t.hint && <p className="text-[10px] text-white/40">{t.hint}</p>}
            </div>
          ))}
        </div>

        {/* Score & how to move it (tradie only) */}
        {perf.score && (
          <Panel>
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] uppercase tracking-widest text-white/40">Trust score & how to move it</p>
              <p className="text-2xl font-extrabold text-hivis-400">{perf.score.value}</p>
            </div>
            <p className="mt-1 text-xs text-white/50">
              70% accuracy ({perf.score.avgAbsMoneyVariancePct !== null ? `±${perf.score.avgAbsMoneyVariancePct.toFixed(0)}% money` : "no priced jobs"}
              {perf.score.avgAbsTimeVariancePct !== null ? ` · ±${perf.score.avgAbsTimeVariancePct.toFixed(0)}% time` : ""}) · 30% feedback (
              {perf.score.avgRating !== null ? `★ ${perf.score.avgRating.toFixed(1)} from ${perf.score.reviewCount}` : "none yet"})
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {perf.score.tips.map((tip) => (
                <li key={tip} className="text-xs leading-relaxed text-white/70">
                  → {tip}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Per property (pm/owner) */}
        {perf.perProperty && perf.perProperty.length > 0 && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Per property</p>
            <div className="flex flex-col gap-2.5">
              {perf.perProperty.map((pp) => (
                <div key={pp.propertyId} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-white/80">{pp.address}</p>
                    <p className="text-xs text-white/40">
                      {pp.openJobs} open · {dollars(pp.spend12moCents)} (12mo) · {pp.warranties} warrant{pp.warranties === 1 ? "y" : "ies"}
                      {pp.trustBalanceCents !== null ? ` · trust ${dollars(pp.trustBalanceCents)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${
                      pp.compliance === "green" ? "bg-mint-400" : pp.compliance === "amber" ? "bg-amber-400" : "bg-red-500"
                    }`}
                  />
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Jobs by status + money */}
        <Panel>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Jobs & money</p>
          <div className="flex flex-wrap gap-1.5">
            {perf.jobsByStatus.map((j) => (
              <span key={j.state} className="rounded-full border border-field-line px-2.5 py-1 text-[10px] text-white/70">
                {j.state.replace(/_/g, " ")} <span className="font-bold text-white">{j.count}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-white/60">
            {perf.scope === "tradie" ? (
              <>Quoted {dollars(perf.money.quotedCents)} · invoiced {dollars(perf.money.invoicedCents)} · collected{" "}
              <span className="font-bold text-mint-300">{dollars(perf.money.collectedCents)}</span></>
            ) : (
              <>Invoiced {dollars(perf.money.invoicedCents)} · settled{" "}
              <span className="font-bold text-mint-300">{dollars(perf.money.collectedCents)}</span></>
            )}
            {perf.money.awaitingFundsCents > 0 && (
              <span className="text-amber-300"> · {dollars(perf.money.awaitingFundsCents)} awaiting funds</span>
            )}
          </p>
        </Panel>

        {/* Who did what when */}
        <Panel>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">
            {perf.scope === "tradie" ? "Who did what, when" : "Latest across the portfolio"}
          </p>
          <div className="flex flex-col gap-1.5">
            {perf.activity.map((a, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-white/70">
                  <span className="font-semibold text-white">{a.who}</span> — {a.what} · {a.job}
                </span>
                <span className="shrink-0 text-white/30">
                  {new Date(a.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Parts used (tradie) */}
        {perf.partsUsed.length > 0 && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Parts used</p>
            {perf.partsUsed.map((pt, i) => (
              <div key={i} className="flex justify-between text-xs text-white/70">
                <span>🔩 {pt.label} · {pt.job}</span>
                {pt.costCents !== null && <span className="text-white/50">{dollars(pt.costCents)}</span>}
              </div>
            ))}
          </Panel>
        )}

        {/* Warranty obligations / coverage */}
        {perf.warranties.length > 0 && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">
              {perf.scope === "tradie" ? "Warranty obligations (your promises)" : "Warranty coverage (your protection)"}
            </p>
            {perf.warranties.map((w, i) => (
              <p key={i} className="text-xs text-white/70">
                🛡 {w.assetLabel} — until {new Date(w.until).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}
                {w.property && perf.scope === "tradie" ? ` · ${w.property}` : ""}
              </p>
            ))}
          </Panel>
        )}

        {/* Feedback (tradie) */}
        {perf.scope === "tradie" && (
          <Panel>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Your feedback</p>
            {perf.reviews.length === 0 ? (
              <p className="text-sm text-white/40">No reviews yet — they arrive after customers verify jobs.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {perf.reviews.map((r) => (
                  <div key={r.id} className="border-t border-field-line pt-2 first:border-t-0 first:pt-0">
                    <p className="text-sm text-hivis-400">{stars(r.rating)} <span className="text-xs text-white/40">· {r.jobTitle} · {r.reviewerRole}</span></p>
                    {r.comment && <p className="mt-0.5 text-xs text-white/70">&ldquo;{r.comment}&rdquo;</p>}
                    {r.response ? (
                      <p className="mt-1 rounded-lg bg-field-950 px-2 py-1.5 text-[11px] text-white/60">
                        <span className="font-semibold text-white/80">You replied:</span> {r.response}
                      </p>
                    ) : (
                      <RespondBox token={token} reviewId={r.id} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        <Link href={backHref} className="text-center text-xs font-semibold text-white/40">
          ← Back
        </Link>
      </div>
    </>
  );
}
