import { getData } from "@/lib/data";
import { QuoteForm } from "./quote-form";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await (await getData()).getQuoteContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This quote link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">
          It may have already been submitted, or the request was assigned to someone else.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-medium text-emerald-700">Quote requested — hi {context.tradieName}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{context.requestTitle}</h1>
      <p className="text-sm text-slate-500">{context.propertyAddress}</p>

      <div className="my-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{context.requestDescription}</p>
      </div>

      <QuoteForm token={token} />
    </div>
  );
}
