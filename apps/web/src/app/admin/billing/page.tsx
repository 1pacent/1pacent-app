import { listBillingTiers, getBillingSettings, billingSystemStatus } from "@/lib/billing";
import { BillingConsole } from "./billing-editor";

export const dynamic = "force-dynamic";

/**
 * The billing catalogue console (v9 R9). ONE editable source of truth for PM
 * subscription tiers and transaction fees, provisioned out to Stripe (billing
 * engine) and HubSpot (CRM). Protected by the admin gate (middleware).
 */
export default async function AdminBillingPage() {
  const [tiers, settings] = await Promise.all([listBillingTiers(true), getBillingSettings()]);
  const status = billingSystemStatus();

  return (
    <div className="min-h-dvh bg-field-950 text-white" style={{ colorScheme: "dark" }}>
      <div className="mx-auto w-full max-w-3xl px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <div>
            <p className="text-lg font-extrabold">
              <span className="text-hivis-400">■</span> Billing catalogue
            </p>
            <p className="text-[10px] uppercase tracking-widest text-white/30">
              One source of truth · edit here → push to Stripe + HubSpot
            </p>
          </div>
          <a href="/admin" className="text-xs font-semibold text-white/40 hover:text-white">
            ← Console
          </a>
        </header>

        <p className="mb-5 rounded-xl border border-field-line bg-field-900 px-4 py-3 text-xs text-white/50">
          The PM monthly charge = <span className="text-white/80">base fee + per-property × cap</span>. Edits are saved
          here (the database source of truth); pressing <span className="text-hivis-300">Push</span> provisions the
          Stripe Product + recurring Price (keyed by SKU) and mirrors the product to HubSpot. The transaction fee is
          deducted from settled job value at payout.
        </p>

        <BillingConsole tiers={tiers} settings={settings} status={status} />
      </div>
    </div>
  );
}
