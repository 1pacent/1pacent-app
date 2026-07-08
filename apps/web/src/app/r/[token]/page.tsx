import type { RequestEvent } from "@1pacent/core";
import { getData } from "@/lib/data";
import { RequestTracker, type TrackerRequest, type TrackerStep } from "./request-tracker";
import { SallyChat } from "./sally-chat";

export const dynamic = "force-dynamic";

const STEP_LABELS: Record<RequestEvent, string> = {
  triage: "Reported to Sally",
  request_approval: "Sent to your landlord for approval",
  auto_approve: "Approved",
  approve: "Approved by your landlord",
  decline: "Declined by your landlord",
  request_quotes: "Getting quotes from tradies",
  accept_quote: "A tradie was chosen",
  schedule: "Tradie scheduled",
  start_work: "Tradie started work",
  submit_evidence: "Tradie says it's done",
  reject_evidence: "Sent back to the tradie",
  verify: "You confirmed it's fixed",
  invoice: "Invoiced",
  record_payment: "Paid",
  close: "Closed",
  cancel: "Cancelled",
};

export default async function TenantIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  const context = await data.getIntakeContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ask your rental provider or property manager for a fresh repair-request link.
        </p>
      </div>
    );
  }

  const statuses = await data.getRequestStatusForContact(token);
  const trackerRequests: TrackerRequest[] = statuses.map((r) => {
    const steps: TrackerStep[] = r.events.map((e) => ({
      label: STEP_LABELS[e.eventType] ?? e.eventType.replace(/_/g, " "),
      at: e.at ?? null,
      note: e.note,
    }));
    return {
      requestId: r.id,
      title: r.title,
      stateLabel: r.state,
      isWarrantyClaim: r.isWarrantyClaim,
      awaitingYourConfirmation: r.state === "evidence_pending",
      steps,
    };
  });

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-medium text-brand-700">Report a repair — no account needed</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">
        {context.property.address}, {context.property.suburb}
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Chat with Sally below — urgent problems (no hot water, gas leaks, flooding) are fast-tracked
        automatically under Victorian rental law.
      </p>
      <SallyChat token={token} />
      <RequestTracker token={token} requests={trackerRequests} />
    </div>
  );
}
