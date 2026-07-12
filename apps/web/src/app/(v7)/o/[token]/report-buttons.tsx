"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateReportAction } from "@/app/canvas-actions";

const KINDS = [
  { kind: "property_data_pack" as const, label: "Property Data Pack", note: "for your accountant / at sale" },
  { kind: "spending_summary" as const, label: "Spending summary", note: "last 12 months, vs the network" },
  { kind: "obligations_calendar" as const, label: "Obligations calendar", note: "what's due, month by month" },
];

/** Manual report generation — the same capability Sally offers in chat,
 * guaranteed to exist with the AI off (Product Design v6 §4.5 rule 2). */
export function ReportButtons({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Reports</h2>
      <p className="mt-1 text-xs text-slate-500">
        Generated straight from the ledger. Depreciation figures are planning estimates, never a tax schedule.
      </p>
      <div className="mt-3 space-y-2">
        {KINDS.map(({ kind, label, note }) => (
          <div key={kind} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-400">{note}</p>
            </div>
            {links[kind] ? (
              <Link href={links[kind]!} className="text-xs font-semibold text-brand-700 hover:underline">
                Open ↗
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await generateReportAction(token, kind);
                    if (result.ok && result.reportId) {
                      setLinks((l) => ({ ...l, [kind]: `/o/${token}/report/${result.reportId}` }));
                      router.refresh();
                    } else setError(result.error ?? "Could not generate that report.");
                  });
                }}
                className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                Generate
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
