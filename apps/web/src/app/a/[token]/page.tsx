import { formatCents } from "@1pacent/core";
import { getData } from "@/lib/data";
import { ApprovalCard } from "./approval-card";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await (await getData()).getApprovalContext(token);

  if (!context) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This approval link isn&apos;t active</h1>
        <p className="mt-2 text-sm text-slate-600">
          Approval links are single-use and expire after 72 hours for your security.
        </p>
      </div>
    );
  }

  const { request } = context;
  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-medium text-emerald-700">Approval requested</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{request.title}</h1>
      <p className="text-sm text-slate-500">{request.address}</p>

      <div className="my-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">{request.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Category</dt>
            <dd className="font-medium text-slate-900">{request.category.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Estimated cost</dt>
            <dd className="font-medium text-slate-900">
              {request.estimateCents ? formatCents(request.estimateCents) : "Quote to follow"}
            </dd>
          </div>
        </dl>
      </div>

      <ApprovalCard token={token} />
    </div>
  );
}
