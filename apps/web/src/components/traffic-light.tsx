import type { TrafficLight } from "@1pacent/core";

const STYLES: Record<TrafficLight, { dot: string; label: string; text: string }> = {
  green: { dot: "bg-emerald-500", label: "Compliant", text: "text-emerald-700" },
  amber: { dot: "bg-amber-500", label: "Due soon", text: "text-amber-700" },
  red: { dot: "bg-red-500", label: "Action required", text: "text-red-700" },
};

export function TrafficLightBadge({ status, label }: { status: TrafficLight; label?: string }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.text}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
      {label ?? s.label}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      {state.replace(/_/g, " ")}
    </span>
  );
}
