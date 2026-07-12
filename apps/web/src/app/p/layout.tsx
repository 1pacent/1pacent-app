import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "1Pacent Pulse",
  description: "Press the button, and the job runs itself — while the address remembers everything.",
};

/**
 * The Hi-Vis shell (Developer Brief v8 §7): dark-first, thumb-first, one
 * primary action per screen. The world is deep field green; hi-vis gold is
 * reserved for the action that matters.
 */
export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8">{children}</div>
    </div>
  );
}
