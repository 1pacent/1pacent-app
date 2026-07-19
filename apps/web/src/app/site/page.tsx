import type { Metadata } from "next";
import { FelixWidget } from "@/components/felix-widget";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "The Fix Button — press it, and the job runs itself",
  description:
    "One button for property repairs: upfront fixed prices from real completed jobs, licence-verified tradies, live tracking, money released only when you say it's done — and an address record that remembers everything, forever.",
};

export const dynamic = "force-static";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How does it actually work?",
    a: "Press the button, snap a photo, say what's wrong. Our AI concierge works out the job type; the price comes from real completed jobs like yours nearby — not a guess. Verified tradies who are online right now get pinged; the first to accept is yours. You watch the whole job live — booked, on the way, on site, done — then you tap Verify and only then does money move. The job writes itself into your property's permanent record.",
  },
  {
    q: "How do I know I'm getting the best price without collecting quotes?",
    a: "Standard jobs (leaking tap, gas check, smoke alarms) are priced from the network's Cost Index — the median of real invoices for that exact job in your area, shown to you with its basis. No padding, no call-out surprises, charged only on your verification. Non-standard jobs still run a competitive 3-quote round backstage, ranked on trust (40%), price (35%) and speed (25%) — you see all quotes and the honest recommendation.",
  },
  {
    q: "What if the price changes once the tradie is on site?",
    a: "Small, reasonable changes (inside the job type's threshold) apply automatically and are logged. Anything bigger — or any part that meaningfully adds cost — pauses the work and comes to the payer as a one-tap approve/decline on their lock screen. Structurally, a surprise bill cannot happen.",
  },
  {
    q: "When does money actually move?",
    a: "Never before you say so. Booking places a card authorization (a hold — no money moves). The tradie can't even mark the job done until the required photo evidence is on the record. When you tap Verify, the payment captures and the tradie is paid the same day. We never hold your money — a licensed payment provider does.",
  },
  {
    q: "How are tradies vetted?",
    a: "Licence and insurance are verified before a tradie can go online, and re-checked on a schedule. Every completed job then sharpens their trust score: how close their quotes are to final invoices AND how close their estimated time is to actual time on site. Chronic overrunners and over-quoters sink; sharp operators rise and win more work.",
  },
  {
    q: "What is the Address Record?",
    a: "Every job leaves a permanent, verified entry against the property: the asset touched and its age, photos, the invoice against the estimate, the warranty countdown, compliance certificates. Zero data entry — it's exhaust from jobs. At sale, tax or insurance time you compile it into a Data Pack with one tap. It's a medical file for your property, and it appreciates with every job.",
  },
  {
    q: "I'm a landlord — do I have to approve every little thing?",
    a: "Only if you want to. Set Autopilot once: approve anything under $X, only tradies above trust score Y, and safety work (gas, dangerous electrical, smoke alarms) always asks you. Everything inside your rules just happens and is logged with the rule that allowed it; everything outside lands on your lock screen as a one-tap decision. Most landlords live entirely on those taps and a monthly summary.",
  },
  {
    q: "What about urgent repairs at a rental?",
    a: "Statutorily urgent issues (burst pipes, gas leaks, no hot water, dangerous electrical faults — the legal urgent-repairs list) are recognised automatically, jump the approval queue as the law provides, and get the earliest verified slots — with everything logged for compliance.",
  },
  {
    q: "I'm a renter — what does it cost me?",
    a: "Nothing. You press the button, your rental provider pays under rules they've already set. You get what you've never had: a face, a licence badge, a live ETA, and proof it's actually being handled.",
  },
  {
    q: "I'm a tradie — what's in it for me?",
    a: "Go online like a driver. Jobs ping with the price, address and a property briefing (you arrive already knowing the hot-water system's age). One tap accepts. Your day gets routed. Photo evidence closes the job — and you're paid the same day it's verified, not in 60 days. The back office you do at 9pm disappears.",
  },
  {
    q: "What happens if there's a dispute?",
    a: "The record decides. Every job carries before/after photos, timestamps, the approved price and every decision with who made it. Money only moved after the payer verified. That evidence pack resolves most disputes in minutes — and until verification, the hold can simply be released.",
  },
  {
    q: "Is my data sold?",
    a: "No. Your property's record belongs to that property and leaves only on the owner's explicit opt-in (e.g., handing a Data Pack to a buyer). Network pricing statistics are aggregated and anonymised.",
  },
];

const STEPS = [
  { n: "1", t: "Press the button", d: "Photo + a sentence. The concierge works out the rest — job type, urgency, the playbook." },
  { n: "2", t: "See the price before you commit", d: "A fixed price from real completed jobs nearby, licence-verified tradie, earliest slots. Book it in one tap." },
  { n: "3", t: "Watch it happen", d: "One live screen everyone shares: on the way, on site, photo evidence landing as the work happens." },
  { n: "4", t: "Verify, then money moves", d: "You tap \"it's fixed\". Only then is payment captured — and the tradie is paid the same day." },
  { n: "5", t: "The address remembers", d: "Asset, warranty, certificate, price — written to the property's permanent record. Forever." },
];

/** The customer-facing site. Served at / on the marketing domain (middleware
 * rewrite) and at /site on the app host. Static — no data dependencies. */
export default function SitePage() {
  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto w-full max-w-3xl px-5 pb-16">
        {/* Nav */}
        <header className="flex items-center justify-between py-5">
          <p className="text-lg font-extrabold tracking-tight">
            <span className="text-hivis-400">■</span> The Fix Button
          </p>
          <nav className="flex gap-4 text-xs font-semibold text-white/60">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#join" className="hover:text-white">Join</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
        </header>

        {/* Hero */}
        <section className="pt-10 pb-14 text-center">
          <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Press the button,
            <br />
            and the repair <span className="text-hivis-400">runs itself</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-white/60">
            Upfront fixed prices from real completed jobs. Licence-verified tradies who are online right now. A live
            screen everyone shares. Money moves only when <em>you</em> say it&apos;s done — and every job writes itself
            into your property&apos;s permanent record.
          </p>
          <div className="mx-auto mt-8 max-w-sm">
            <a
              href="#join"
              className="hivis-breathe block rounded-2xl bg-hivis-400 px-6 py-4 text-lg font-bold text-field-950 active:scale-[0.98]"
            >
              🛠 Something needs fixing
            </a>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
              Melbourne first · licence-verified · no payment until you verify
            </p>
          </div>
        </section>

        {/* Why it's different */}
        <section className="grid gap-3 sm:grid-cols-2">
          {[
            ["No quote homework", "Standard jobs carry a fixed price from the network's real invoices — with the basis shown. Big jobs still race three quotes, ranked honestly."],
            ["No surprise bills", "On-site changes and parts pause for a one-tap payer approval unless they're genuinely minor. Structurally — not as a promise."],
            ["No chasing anyone", "One shared live job screen for renter, owner, manager and tradie. If it changes in the world, it changes on your screen."],
            ["No leap of faith", "Money is only authorized at booking. It captures when you verify the work — and the tradie is paid the same day."],
            ["A record, not a receipt", "Every job becomes a permanent entry in the Address Record: assets, ages, warranties, certificates. Gold at sale, tax and insurance time."],
            ["Rules, not nagging", "Landlords set Autopilot once — spend cap, trust floor, safety exceptions — then decide the rest from the lock screen in one tap."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-field-line bg-field-900 p-5">
              <p className="font-bold text-white">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/50">{d}</p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section id="how" className="pt-16">
          <h2 className="text-center font-serif text-3xl font-semibold">How it works</h2>
          <div className="mt-8 flex flex-col gap-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-4 rounded-2xl border border-field-line bg-field-900 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hivis-400 font-extrabold text-field-950">
                  {s.n}
                </span>
                <div>
                  <p className="font-bold text-white">{s.t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/50">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-2xl border border-field-line bg-field-900 p-5 text-sm leading-relaxed text-white/50">
            <span className="font-bold text-white">Under the hood, one rule:</span> AI proposes, humans decide, and a
            deterministic ledger executes. Every approval, payment and photo has a named human actor on an append-only
            event record. That&apos;s why the network can be trusted with money and compliance — and why it feels like
            magic instead of paperwork.
          </p>
        </section>

        {/* Who it's for */}
        <section className="pt-16">
          <h2 className="text-center font-serif text-3xl font-semibold">One network, four seats</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ["Renters", "Report in 20 seconds. See a face, a licence badge and an ETA — never chase anyone again. Costs you nothing."],
              ["Owners & landlords", "Set the rules once. Approve from your lock screen. Watch your asset's record build itself."],
              ["Property managers", "The Dispatch Deck: every job a live tile, exceptions float up, same-suburb compliance runs batched into one route."],
              ["Tradies", "Go online, get pinged with price and a site briefing, one tap accepts, day gets routed — and you're paid same-day on verification."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-field-line bg-field-900 p-5">
                <p className="font-bold text-hivis-400">{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/50">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Join / onboarding */}
        <section id="join" className="pt-16">
          <h2 className="text-center font-serif text-3xl font-semibold">Join the network</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-white/50">
            We light up suburb by suburb so your very first job already has verified tradies online. Tell us who you
            are and where — onboarding takes minutes when your area goes live:
            renters scan a QR and just press the button; landlords claim their address and see their compliance
            standing in 60 seconds; managers forward a rent roll; tradies verify their licence and set a rate card in
            one 3-minute conversation.
          </p>
          <div className="mt-8">
            <JoinForm />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="pt-16">
          <h2 className="text-center font-serif text-3xl font-semibold">Questions, answered straight</h2>
          <div className="mt-8 flex flex-col gap-2">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-field-line bg-field-900 px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-white">
                  <span className="mr-2 text-hivis-400 transition-transform group-open:rotate-90">›</span>
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="pt-16 text-center text-[10px] leading-relaxed text-white/30">
          <p>
            The Fix Button · a 1Pacent company · Melbourne, Australia
            <br />
            Payments are processed by a licensed payment provider; we never hold client funds. Planning estimates are
            not tax or legal advice. VIC urgent-repair provisions honoured.
          </p>
        </footer>
      </div>
      <FelixWidget theme="dark" />
    </div>
  );
}
