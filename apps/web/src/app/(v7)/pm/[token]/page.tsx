import { formatCents } from "@1pacent/core";
import { Canvas } from "@/components/canvas";
import { TalkPanel } from "@/components/talk-panel";
import { TwinPanel } from "@/components/twin-panel";
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
  const data = await getData();
  const context = await data.getPmPortfolioContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">Ask Zaivo for a fresh portfolio link.</p>
      </div>
    );
  }

  const cards = await data.getCanvasCards(token);

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-sm font-medium text-brand-700">Property manager portfolio</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Hi {context.pmName}</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Ask Sally about the portfolio on the left; obligations, batchable work and the crew&apos;s progress land
        on the board. Landlords approve their own spend — you only see what needs you.
      </p>

      <div className="mb-10">
        <TwinPanel
          talk={<TalkPanel mode="pm_portfolio" token={token} />}
          board={<Canvas cards={cards} token={token} scope="pm" />}
        />
      </div>

      <h2 className="mb-4 font-serif text-lg font-semibold text-slate-900">Portfolio workspace</h2>

      {context.properties.length === 0 && (
        <p className="text-sm text-slate-500">No properties assigned to you yet.</p>
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
