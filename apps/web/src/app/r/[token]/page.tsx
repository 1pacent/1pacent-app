import { getData } from "@/lib/data";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export default async function TenantIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await (await getData()).getIntakeContext(token);

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

  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm font-medium text-emerald-700">Report a repair — no account needed</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">
        {context.property.address}, {context.property.suburb}
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">
        Takes under 90 seconds. Urgent problems (no hot water, gas leaks, flooding) are
        fast-tracked automatically under Victorian rental law.
      </p>
      <IntakeForm token={token} />
    </div>
  );
}
