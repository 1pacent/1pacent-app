import { formatCents } from "@1pacent/core";
import { getData } from "@/lib/data";
import { JobsPanel, type JobsPanelJob } from "./jobs-panel";
import { RateCardForm } from "./rate-card-form";

export const dynamic = "force-dynamic";

export default async function TradiePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const context = await data.getTradiePortalContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">Ask 1Pacent for a fresh portal link.</p>
      </div>
    );
  }

  const [leads, tradieJobs] = await Promise.all([data.listTradieLeads(token), data.listTradieJobs(token)]);
  const jobs: JobsPanelJob[] = tradieJobs.map((j) => ({
    workOrderId: j.workOrderId,
    category: j.category,
    requestTitle: j.requestTitle,
    propertyAddress: j.propertyAddress,
    stateLabel: j.state as JobsPanelJob["stateLabel"],
    quoteDisplay:
      j.quoteCents === 0 && j.callOutFeeCents === 0
        ? "Warranty claim — no charge"
        : j.quoteCents !== null && j.callOutFeeCents !== null
          ? `${formatCents(j.quoteCents + j.callOutFeeCents)} total`
          : "Pending quote",
  }));

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-medium text-emerald-700">Your business</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Hi {context.tradieName}</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Sally answers your missed calls in your business&apos;s name, using your own rate card below — for
        1Pacent jobs and for your own customers, from your own lead-intake link.
      </p>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">My jobs</h2>
        <JobsPanel token={token} jobs={jobs} />
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Your leads</h2>
        {leads.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No enquiries yet — share your lead-intake link to start.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {leads.map((lead) => (
              <div key={lead.leadId} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">
                    {lead.customerName} — {lead.title}
                  </span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {lead.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{lead.description}</p>
                {lead.suggestedQuoteCents !== null && (
                  <p className="mt-1 text-xs text-emerald-700">
                    Suggested from your rate card: {formatCents(lead.suggestedQuoteCents)}
                    {lead.suggestedCallOutFeeCents !== null ? ` + ${formatCents(lead.suggestedCallOutFeeCents)} call-out` : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Rate card</h2>
      <p className="mt-1 mb-4 text-xs text-slate-500">
        Set your call-out fee and hourly rate once — every quote you&apos;re asked for auto-fills from
        this, so you&apos;re never starting from a blank field. You still confirm or adjust every quote
        before it sends; nothing here is set by AI.
      </p>
      <RateCardForm token={token} rateCard={context.rateCard} />
    </div>
  );
}
