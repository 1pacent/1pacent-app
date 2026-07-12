import type { JobProjection } from "@/lib/data-types";

/**
 * The status arc — the product's heartbeat. Breathes while the job is live.
 */
export function StatusArc({ arc }: { arc: JobProjection["arc"] }) {
  return (
    <div className="py-2">
      <div className="flex items-center">
        {arc.map((step, i) => (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={
                  step.active
                    ? "hivis-breathe h-4 w-4 rounded-full bg-hivis-400"
                    : step.done
                      ? "h-3 w-3 rounded-full bg-mint-400"
                      : "h-3 w-3 rounded-full border border-field-line bg-field-800"
                }
              />
            </div>
            {i < arc.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 rounded ${step.done ? "bg-mint-400/60" : "bg-field-line"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wide text-white/40">
        <span>{arc[0]?.label}</span>
        <span className="font-bold text-hivis-400">{arc.find((s) => s.active)?.label ?? ""}</span>
        <span>{arc[arc.length - 1]?.label}</span>
      </div>
    </div>
  );
}
