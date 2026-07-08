import { getData } from "@/lib/data";
import { LeadChat } from "./lead-chat";

export const dynamic = "force-dynamic";

export default async function LeadIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await (await getData()).getTradieLeadIntakeInfo(token);

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">Ask for a fresh link from the business you&apos;re contacting.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-medium text-brand-700">{info.tradieBusinessName}</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-slate-900">Get in touch</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Chat with Sally below — she&apos;ll get your job details and {info.tradieBusinessName} will follow up with
        a quote.
      </p>
      <LeadChat token={token} businessName={info.tradieBusinessName} />
    </div>
  );
}
