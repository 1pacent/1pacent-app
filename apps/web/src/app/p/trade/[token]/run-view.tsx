import type { TradieRunView } from "@/lib/data-types";

function hm(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })
    .replace(/\s/g, "");
}

/**
 * George's Run (Developer Brief v8 §5): the day as a drivable route — booked
 * slots anchored, travel legs estimated, conflicts flagged loudly instead of
 * silently re-booked. External-calendar busy windows overlay when the tradie
 * has granted read access.
 */
export function RunView({ run }: { run: TradieRunView }) {
  if (run.legs.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
        George&apos;s run · {run.totalOnSiteMinutes} min on the tools · {run.totalTravelMinutes} min driving
      </p>
      <div className="flex flex-col">
        {run.legs.map((leg, i) => (
          <div key={leg.workOrderId} className="relative flex gap-3 pb-3">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-3 w-3 rounded-full ${leg.conflict ? "bg-red-400" : i === 0 ? "bg-hivis-400" : "bg-mint-400/60"}`}
              />
              {i < run.legs.length - 1 && <span className="w-px flex-1 bg-field-line" />}
            </div>
            <div className="flex-1 rounded-2xl border border-field-line bg-field-900 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">{leg.title}</p>
                <p className="text-xs font-semibold text-hivis-400">{hm(leg.arriveAt)}</p>
              </div>
              <p className="text-xs text-white/40">{leg.address}</p>
              <p className="mt-1 text-[10px] text-white/40">
                {leg.travelMinutes > 0 ? `${leg.travelMinutes} min drive · ` : ""}
                {leg.slotLabel ?? "no fixed slot"}
              </p>
              {leg.conflict && (
                <p className="mt-1.5 rounded-lg bg-red-500/15 px-2 py-1 text-[10px] font-semibold text-red-300">
                  Can&apos;t make this booked slot from the previous stop — re-book or call ahead.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {run.calendarBusy.length > 0 && (
        <p className="text-[10px] text-white/40">
          Your calendar shows {run.calendarBusy.length} busy window{run.calendarBusy.length === 1 ? "" : "s"} today —
          George planned around the ledger; check for clashes.
        </p>
      )}
    </div>
  );
}
