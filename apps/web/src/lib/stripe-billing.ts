import "server-only";

/**
 * Stripe billing provisioning (v9 R9). Pushes a subscription tier OUT to
 * Stripe as a Product + a recurring monthly Price, keyed by the SKU as the
 * price `lookup_key` — so the SKU is the single join across billing_tiers,
 * Stripe, and HubSpot. Stripe is the billing system of record; this module
 * only writes the catalogue, never charges (that's the PM checkout flow).
 *
 * Stripe Prices are immutable: a price change creates a NEW Price (moving the
 * lookup_key across with `transfer_lookup_key`) and archives the old one.
 *
 * Without STRIPE_SECRET_KEY it runs in SIMULATED mode (sim_* ids) so the
 * console and its flow are fully testable before Stripe go-live — mirroring
 * the SimulatedPsp pattern in payments.ts.
 */

export interface TierProvisionInput {
  sku: string;
  name: string;
  description?: string | null;
  /** The monthly charge Stripe bills for this tier, in cents. */
  monthlyCents: number;
  currency: string;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
}

export interface TierProvisionResult {
  ok: boolean;
  simulated: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  error?: string;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeCall(
  path: string,
  params: Record<string, string>,
  method: "POST" | "GET" = "POST",
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const key = process.env.STRIPE_SECRET_KEY!;
  const isGet = method === "GET";
  const url = `https://api.stripe.com/v1/${path}${isGet && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(isGet ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: isGet ? undefined : new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, body };
}

function stripeErr(body: Record<string, unknown>): string {
  const e = body.error as { message?: string } | undefined;
  return e?.message ?? "Stripe call failed";
}

/**
 * Provision (create or update) the Stripe Product + recurring Price for a
 * tier. Idempotent: reuses the product; only mints a new Price when the
 * monthly amount actually changed, archiving the previous one.
 */
export async function provisionStripeTier(input: TierProvisionInput): Promise<TierProvisionResult> {
  if (!stripeConfigured()) {
    return {
      ok: true,
      simulated: true,
      stripeProductId: input.stripeProductId ?? `sim_prod_${input.sku}`,
      stripePriceId: `sim_price_${input.sku}_${input.monthlyCents}`,
    };
  }
  try {
    // 1) Product — create or patch name/description.
    let productId = input.stripeProductId ?? undefined;
    const productParams: Record<string, string> = {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      "metadata[sku]": input.sku,
    };
    if (productId) {
      const upd = await stripeCall(`products/${productId}`, productParams);
      if (!upd.ok) return { ok: false, simulated: false, error: stripeErr(upd.body) };
    } else {
      const created = await stripeCall("products", productParams);
      if (!created.ok) return { ok: false, simulated: false, error: stripeErr(created.body) };
      productId = String(created.body.id);
    }

    // 2) Price — reuse if the amount is unchanged, else mint a new one.
    let priceId = input.stripePriceId ?? undefined;
    let amountUnchanged = false;
    if (priceId) {
      const existing = await stripeCall(`prices/${priceId}`, {}, "GET");
      if (existing.ok && Number(existing.body.unit_amount) === input.monthlyCents && existing.body.active === true) {
        amountUnchanged = true;
      }
    }
    if (!amountUnchanged) {
      const priceParams: Record<string, string> = {
        product: productId!,
        currency: input.currency,
        unit_amount: String(input.monthlyCents),
        "recurring[interval]": "month",
        lookup_key: input.sku,
        transfer_lookup_key: "true", // move the SKU key onto the new price
        "metadata[sku]": input.sku,
      };
      const price = await stripeCall("prices", priceParams);
      if (!price.ok) return { ok: false, simulated: false, error: stripeErr(price.body) };
      // Archive the superseded price (lookup_key already transferred away).
      if (priceId) await stripeCall(`prices/${priceId}`, { active: "false" });
      priceId = String(price.body.id);
    }

    return { ok: true, simulated: false, stripeProductId: productId, stripePriceId: priceId };
  } catch (e) {
    return { ok: false, simulated: false, error: e instanceof Error ? e.message : "provision failed" };
  }
}
