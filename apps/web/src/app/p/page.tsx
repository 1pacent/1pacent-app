import Link from "next/link";
import { PulseTopBar, Panel } from "@/components/pulse/shell";
import { supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SEATS = [
  {
    as: "fix",
    title: "Something needs fixing",
    body: "Renter or homeowner — press the button, get a price, watch it happen.",
    accent: true,
  },
  { as: "trade", title: "I'm on the tools", body: "Go online, catch jobs, get paid the same day." },
  { as: "own", title: "I own property", body: "Decisions in one tap. The record builds itself." },
  { as: "deck", title: "I manage a portfolio", body: "Every job, live, on one deck. Exceptions only." },
];

export default function PulseHome() {
  const live = supabaseConfigured();
  return (
    <>
      <PulseTopBar />
      <div className="mt-10 mb-8">
        <h1 className="font-serif text-4xl font-semibold leading-tight">
          Press the button.
          <br />
          <span className="text-hivis-400">The job runs itself.</span>
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Verified tradies · upfront prices · live tracking · paid same day — while the address remembers
          everything.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {SEATS.map((seat) => (
          <Link
            key={seat.as}
            href={`/p/enter?as=${seat.as}`}
            className={
              seat.accent
                ? "hivis-breathe rounded-2xl bg-hivis-400 p-5 text-field-950 transition active:scale-[0.98]"
                : "rounded-2xl border border-field-line bg-field-900 p-5 transition active:scale-[0.98]"
            }
          >
            <p className={`text-lg font-bold ${seat.accent ? "" : "text-white"}`}>{seat.title}</p>
            <p className={`mt-1 text-sm ${seat.accent ? "text-field-950/70" : "text-white/50"}`}>
              {seat.body}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Panel>
          <p className="text-xs text-white/40">
            {live ? "Live network — everything you do here is real and lands on the ledger." : "Demo network — seeded data, full flows."}
            {" "}Money is never held by 1Pacent: your card is authorized at booking and charged only when you
            say the job's done.
          </p>
        </Panel>
      </div>
    </>
  );
}
