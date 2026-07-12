import Link from "next/link";

export function PulseTopBar({ back, title }: { back?: string; title?: string }) {
  return (
    <header className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        {back && (
          <Link
            href={back}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[--color-field-line] text-lg text-white/70 active:scale-95"
          >
            ←
          </Link>
        )}
        <Link href="/p" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[--color-hivis-400] font-serif text-sm font-bold text-[--color-field-950]">
            1P
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight">
            {title ?? "Pulse"}
          </span>
        </Link>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-white/30">the address remembers</span>
    </header>
  );
}

export function Panel({ children, glow }: { children: React.ReactNode; glow?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-[--color-field-900] p-4 ${glow ? "border-[--color-hivis-400]/60" : "border-[--color-field-line]"}`}
    >
      {children}
    </div>
  );
}

/** The one action that matters — the only place hi-vis gold is allowed. */
export function HiVisButton({
  children,
  onClick,
  disabled,
  type = "button",
  breathe,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  breathe?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl bg-[--color-hivis-400] px-6 py-4 text-center text-lg font-bold text-[--color-field-950] shadow-lg transition active:scale-[0.98] disabled:opacity-40 ${breathe ? "hivis-breathe" : ""}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl border border-[--color-field-line] px-6 py-3.5 text-center text-base font-semibold text-white/80 transition active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
