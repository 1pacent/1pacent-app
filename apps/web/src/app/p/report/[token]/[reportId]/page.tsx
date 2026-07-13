import { getData } from "@/lib/data";
import { Panel, PulseTopBar } from "@/components/pulse/shell";

export const dynamic = "force-dynamic";

/**
 * Generic report renderer (v8 R3): a generated report's payload, laid out
 * readably. The payload is the artifact — rendering is a view concern
 * (0015's rule), so this page never recomputes a number.
 */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string; reportId: string }>;
}) {
  const { token, reportId } = await params;
  const report = await (await getData()).getReport(token, reportId);

  if (!report) {
    return (
      <>
        <PulseTopBar back="/p" />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">No report here</h1>
        </div>
      </>
    );
  }

  const sections = Object.entries(report.payload);

  return (
    <>
      <PulseTopBar back={`/p/record/${token}`} title="Report" />
      <div className="flex flex-col gap-4 pt-2 pb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">
            {report.kind.replace(/_/g, " ")} · {new Date(report.createdAt).toLocaleDateString("en-AU")}
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold">Property Data Pack</h1>
          <p className="mt-1 text-xs text-white/40">
            Compiled from the ledger — planning estimates, not a tax or legal document.
          </p>
        </div>
        {sections.map(([key, value]) => (
          <Panel key={key}>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">{titleCase(key)}</p>
            <ReportValue value={value} />
          </Panel>
        ))}
      </div>
    </>
  );
}

function titleCase(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
}

function formatScalar(value: unknown, key?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && key && /cents/i.test(key)) {
    return `$${(value / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function ReportValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-sm text-white/40">Nothing on record.</p>;
    return (
      <div className="flex flex-col gap-2.5">
        {value.map((item, i) =>
          typeof item === "object" && item !== null ? (
            <div key={i} className="rounded-xl border border-field-line px-3 py-2">
              {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <p key={k} className="flex justify-between gap-3 text-xs">
                  <span className="text-white/40">{titleCase(k)}</span>
                  <span className="text-right text-white/80">{formatScalar(v, k)}</span>
                </p>
              ))}
            </div>
          ) : (
            <p key={i} className="text-sm text-white/80">
              {formatScalar(item)}
            </p>
          ),
        )}
      </div>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <div className="flex flex-col gap-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-white/40">{titleCase(k)}</span>
            <span className="text-right text-white/80">
              {typeof v === "object" && v !== null ? <ReportValue value={v} /> : formatScalar(v, k)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-white/80">{formatScalar(value)}</p>;
}
