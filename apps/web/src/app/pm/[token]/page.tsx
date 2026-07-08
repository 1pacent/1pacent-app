import { formatCents } from "@1pacent/core";
import { StateBadge, TrafficLightBadge } from "@/components/traffic-light";
import { getData } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Property manager portfolio — informed of landlord decisions across every
 * property they manage, not a mandatory approval gate (docs/PRODUCT_BRIEF_v3.md
 * §5.3). Read-only by design: nothing on this page lets the PM approve or
 * decline anything themselves unless a future property explicitly requires
 * PM sign-off.
 */
export default async function PmPortfolioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await (await getData()).getPmPortfolioContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">Ask 1Pacent for a fresh portfolio link.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-medium text-emerald-700">Property manager portfolio</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Hi {context.pmName}</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        You&apos;re informed here as decisions happen — landlords approve their own maintenance spend
        directly, so you don&apos;t need to triage every request yourself.
      </p>

      {context.properties.length === 0 && (
        <p className="text-sm text-slate-500">No properties assigned to you yet.</p>
      )}

      {context.batchableCompliance.length > 0 && (
        <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-sm font-semibold text-emerald-900">Batchable compliance</h2>
          <p className="mt-1 text-xs text-emerald-800">
            These properties need the same check around the same time, in the same suburb — one tradie,
            one route, instead of separate callouts for each.
          </p>
          <div className="mt-3 space-y-2">
            {context.batchableCompliance.map((b, i) => (
              <div key={i} className="rounded-lg bg-white px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">
                  {b.requirementName} — {b.suburb}
                </p>
                <p className="text-xs text-slate-500">{b.propertyAddresses.join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {context.properties.map((property) => (
          <div key={property.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                {property.address}, {property.suburb}
              </h2>
              <TrafficLightBadge status={property.compliance.overall} />
            </div>

            {property.requests.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No maintenance requests yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {property.requests.map((r) => (
                  <div key={r.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">{r.title}</span>
                      <StateBadge state={r.state} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.category.replace(/_/g, " ")}
                      {r.estimateCents ? ` · est. ${formatCents(r.estimateCents)}` : ""}
                    </p>
                    {r.events.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Latest: {r.events[r.events.length - 1]!.eventType.replace(/_/g, " ")} by{" "}
                        {r.events[r.events.length - 1]!.actorType.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
