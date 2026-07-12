import Link from "next/link";
import { notFound } from "next/navigation";
import { classifyTrust, formatCents, rankQuotes, scoreAvailability, scoreTrust } from "@1pacent/core";
import { StateBadge, TrafficLightBadge } from "@/components/traffic-light";
import { getData } from "@/lib/data";
import { ApprovalPanel } from "./approval-panel";
import { OwnershipCard } from "./ownership-card";
import { PolicyCard, type PolicyCardRule } from "./policy-card";
import { QuotesPanel, type QuotesPanelQuote } from "./quotes-panel";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getData();
  const property = await data.getProperty(id);
  if (!property) notFound();

  const policyRules = await data.getApprovalPolicy(id);
  const policyCardRules: PolicyCardRule[] = policyRules
    .filter((r) => r.enabled)
    .map((r) => ({
      maxTotalDisplay: r.maxTotalCents !== null ? (r.maxTotalCents / 100).toFixed(0) : "",
      minTrustScore: r.minTrustScore,
      excludesGasElectrical: r.excludeCategories.length > 0,
    }));

  const quotingRequests = property.requests.filter((r) => r.state === "quoting");
  const quotesByRequest = new Map<string, QuotesPanelQuote[]>();
  if (quotingRequests.length > 0) {
    const quotesPerRequest = await Promise.all(
      quotingRequests.map((r) => data.listQuotesForRequest(r.id)),
    );
    const allTradieIds = [...new Set(quotesPerRequest.flat().map((q) => q.tradieContactId))];
    const trust = await data.getTradieTrustSummaries(allTradieIds);
    quotingRequests.forEach((r, i) => {
      const requestQuotes = quotesPerRequest[i]!;
      const rankable = requestQuotes
        .filter((q) => q.status === "submitted" && q.quoteCents !== null && q.callOutFeeCents !== null)
        .map((q) => ({
          quoteId: q.quoteId,
          totalCents: q.quoteCents! + q.callOutFeeCents!,
          trustScore: scoreTrust(trust[q.tradieContactId] ?? { completedJobs: 0, avgAbsVariancePct: null }),
          availabilityScore: scoreAvailability({
            tradieRespondedWithinMinutes: q.respondedWithinMinutes,
            matchesTenantPreferredWindow: false,
            currentOpenJobCount: 0,
          }),
        }));
      const ranked = rankQuotes(rankable);
      const rankById = new Map(ranked.map((r2) => [r2.quoteId, r2]));

      // Ranked (submitted, priced) quotes first in score order, then anything still awaiting a response.
      const ordered = [...requestQuotes].sort((a, b) => {
        const rankA = rankById.get(a.quoteId)?.rank ?? Number.MAX_SAFE_INTEGER;
        const rankB = rankById.get(b.quoteId)?.rank ?? Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
      });

      quotesByRequest.set(
        r.id,
        ordered.map((q) => {
          const rankedEntry = rankById.get(q.quoteId);
          return {
            quoteId: q.quoteId,
            tradieName: q.tradieName,
            status: q.status,
            note: q.note,
            quoteDisplay: q.quoteCents !== null ? formatCents(q.quoteCents) : null,
            calloutDisplay: q.callOutFeeCents !== null ? formatCents(q.callOutFeeCents) : null,
            totalDisplay:
              q.quoteCents !== null && q.callOutFeeCents !== null
                ? formatCents(q.quoteCents + q.callOutFeeCents)
                : null,
            trustTier: classifyTrust(trust[q.tradieContactId] ?? { completedJobs: 0, avgAbsVariancePct: null }),
            rank: rankedEntry?.rank,
          };
        }),
      );
    });
  }

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
        ← Portfolio
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">
          {property.address}, {property.suburb}
        </h1>
        <TrafficLightBadge status={property.compliance.overall} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Compliance checklist</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Requirement</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Last done</th>
              <th className="px-4 py-2.5">Next due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {property.compliance.requirements.map((r) => (
              <tr key={r.requirement.key}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{r.requirement.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.requirement.legislationRef}</p>
                </td>
                <td className="px-4 py-3">
                  <TrafficLightBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.lastCompletedAt)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {r.dueAt ? (
                    <>
                      {formatDate(r.dueAt)}
                      {r.daysUntilDue !== null && r.daysUntilDue < 0 && (
                        <span className="ml-1 text-xs font-semibold text-red-600">
                          ({-r.daysUntilDue}d overdue)
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {property.openWarranties.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-semibold text-slate-900">Open warranties</h2>
          <div className="mt-3 space-y-2">
            {property.openWarranties.map((w, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <span className="font-medium text-slate-900">{w.assetLabel}</span>
                <span className="text-slate-500"> — {w.tradieName}, until {formatDate(new Date(w.expiresAt))}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <OwnershipCard
          propertyId={property.id}
          occupancyStatus={property.occupancyStatus}
          ownerContactId={property.ownerContactId}
          availableOwners={property.availableOwners}
        />
        <PolicyCard propertyId={property.id} existingRules={policyCardRules} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Maintenance requests</h2>
      <div className="mt-3 space-y-3">
        {property.requests.length === 0 && (
          <p className="text-sm text-slate-500">No requests yet.</p>
        )}
        {property.requests.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{r.title}</p>
                  {r.isWarrantyClaim && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Warranty claim
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {r.category.replace(/_/g, " ")}
                  {r.estimateCents ? ` · est. ${formatCents(r.estimateCents)}` : ""}
                </p>
              </div>
              <StateBadge state={r.state} />
            </div>
            <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-500">
              {r.events.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-700">{e.eventType.replace(/_/g, " ")}</span>{" "}
                  by {e.actorType.replace(/_/g, " ")}
                  {e.note ? ` — ${e.note}` : ""}
                </li>
              ))}
            </ol>
            {r.state === "quoting" && quotesByRequest.has(r.id) && (
              <QuotesPanel requestId={r.id} quotes={quotesByRequest.get(r.id)!} />
            )}
            {r.state === "pending_approval" && <ApprovalPanel requestId={r.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
