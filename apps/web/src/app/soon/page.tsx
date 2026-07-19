import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zaivo — coming soon",
  description: "Press the button, and the repair runs itself. Zaivo is launching soon in Melbourne.",
};

export const dynamic = "force-static";

/** The shutter (v8 R8.2): shown on the public domain while SITE_COMING_SOON
 * is set. Persona links and the operator console are unaffected. */
export default function ComingSoonPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-field-950 px-6 text-white" style={{ colorScheme: "dark" }}>
      <div className="max-w-md text-center">
        <p className="text-lg font-extrabold tracking-tight">
          <span className="text-hivis-400">■</span> Zaivo
        </p>
        <h1 className="mt-8 font-serif text-4xl font-semibold leading-tight">
          Press the button.
          <br />
          The repair <span className="text-hivis-400">runs itself</span>.
        </h1>
        <p className="mt-5 text-sm text-white/50">
          One button for property repairs — upfront prices, licence-verified tradies, live tracking, money released
          only when you say it&apos;s done. Launching soon in Melbourne.
        </p>
        <p className="mt-8 text-xs text-white/40">
          Property manager or tradie who wants in early?{" "}
          <a className="font-semibold text-hivis-400" href="mailto:fixitfelix@agentmail.to">
            fixitfelix@agentmail.to
          </a>
        </p>
      </div>
    </div>
  );
}
