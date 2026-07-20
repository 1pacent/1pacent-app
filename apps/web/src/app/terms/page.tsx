import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — Zaivo",
  description: "Zaivo terms of use.",
};

export const dynamic = "force-static";

/**
 * Terms of Use (v8 R8.3). Plain-English placeholder, not a substitute for a
 * solicitor's review before real money moves at volume — but sets the
 * position the operator asked for: Victoria-governed, no liability accepted,
 * AI outputs may be wrong. Linked once, from the site footer.
 */
export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10">
        <a href="/" className="text-xs font-semibold text-hivis-400">
          ← Zaivo
        </a>
        <h1 className="mt-4 font-serif text-3xl font-semibold">Terms of Use</h1>
        <p className="mt-2 text-xs text-white/40">Last updated 20 July 2026.</p>

        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-white/70">
          <section>
            <h2 className="text-base font-semibold text-white">1. Who we are</h2>
            <p className="mt-2">
              Zaivo is operated by 1Pacent Pty Ltd (&quot;<strong>1Pacent</strong>&quot;, &quot;<strong>we</strong>
              &quot;, &quot;<strong>us</strong>&quot;), a company based in Victoria, Australia. By using this website
              or the Zaivo app you agree to these Terms of Use.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">2. What Zaivo is</h2>
            <p className="mt-2">
              Zaivo is a marketplace and coordination platform that connects renters, owners, landlords, property
              managers and licensed trade contractors (&quot;<strong>tradies</strong>&quot;) to arrange, track and pay
              for property repair and maintenance work. Zaivo is not a tradie, does not perform trade work, and is not
              a party to the contract for services formed between a payer and a tradie for any given job.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">3. No liability accepted</h2>
            <p className="mt-2">
              To the maximum extent permitted by law, 1Pacent accepts no liability for: the quality, safety, timing or
              outcome of any trade work performed by a tradie; any loss, damage, injury or dispute arising from a job
              arranged through Zaivo; the accuracy of any price estimate, quote, availability window, licence or
              insurance status displayed on the platform; or any indirect, incidental or consequential loss of any
              kind. Nothing in these terms excludes a guarantee or right that cannot lawfully be excluded under the
              Australian Consumer Law or the Residential Tenancies Act 1997 (Vic).
            </p>
            <p className="mt-2">
              Tradies using Zaivo represent that they hold all licences, registrations and insurance required by law
              to perform the work they accept. 1Pacent does not guarantee this and recommends payers satisfy
              themselves before high-value or specialised work proceeds.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">4. AI-assisted features</h2>
            <p className="mt-2">
              Zaivo uses artificial intelligence (including an AI concierge and AI-assisted triage) to help describe
              problems, suggest job categories, estimate prices and answer questions. <strong>AI output can be
              incorrect, incomplete or out of date.</strong> By using Zaivo you accept that any AI-generated content —
              including price estimates, category suggestions, and conversational responses — is provided for
              convenience only, is not advice of any kind (including legal, tax, financial or safety advice), and
              must not be relied on without independent judgement. A human decision point (booking, approval,
              verification) always sits between an AI suggestion and any money moving or work proceeding.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">5. Payments</h2>
            <p className="mt-2">
              Payments are processed by a licensed third-party payment provider. 1Pacent does not hold client funds in
              custody. Amounts are authorized at booking and captured only once the payer verifies the work is
              complete, subject to the variance and dispute processes described in-app.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">6. Governing law</h2>
            <p className="mt-2">
              These Terms of Use are governed by the laws of Victoria, Australia, and the parties submit to the
              non-exclusive jurisdiction of the courts of Victoria.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">7. Changes</h2>
            <p className="mt-2">
              We may update these terms from time to time; the current version always applies. Material changes will
              be noted on this page.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">8. Contact</h2>
            <p className="mt-2">
              Questions about these terms:{" "}
              <a className="font-semibold text-hivis-400" href="mailto:fixitfelix@agentmail.to">
                fixitfelix@agentmail.to
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-12 text-center text-[10px] text-white/30">© 2026 1Pacent. All rights reserved.</p>
      </div>
    </div>
  );
}
