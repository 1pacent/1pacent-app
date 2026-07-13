import "server-only";

/**
 * The PSP seam (Developer Brief v8 §4). Regulatory posture in code: 1Pacent
 * never holds funds. "Authorized" is a card hold at the PSP; "captured" is
 * the PSP capturing on verified completion; "transferred" is the PSP paying
 * the tradie's connected account. The deterministic core decides WHEN money
 * may move (payment-plan machine + evidence gates); this seam only executes.
 *
 * `StripePsp` activates with STRIPE_SECRET_KEY (Connect, manual capture);
 * without it `SimulatedPsp` runs the identical lifecycle so every flow works
 * demo-first — the same env-switched-adapter pattern as Hermes/Honcho (v7).
 * Note the honest gap: a real Stripe authorization completes only when the
 * payer confirms a payment sheet client-side; until that UI lands, intents
 * created here sit in `requires_payment_method` on Stripe's dashboard and
 * the ledger records them as pending-authorization.
 */

export interface PspResult {
  ok: boolean;
  pspRef?: string;
  error?: string;
}

export interface PspProvider {
  readonly name: "simulated" | "stripe";
  /** Place the hold. No money moves. */
  authorize(input: { amountCents: number; requestId: string; description: string }): Promise<PspResult>;
  /** Raise the hold for an approved variance. */
  incrementAuthorization(pspRef: string, newAmountCents: number): Promise<PspResult>;
  /** Capture on verified completion (evidence gates already passed in core). */
  capture(pspRef: string): Promise<PspResult>;
  /** Same-day transfer to the tradie's connected account. */
  transfer(input: { amountCents: number; description: string; destination?: string | null }): Promise<PspResult>;
  /** Release the hold (declined variance, cancelled job). */
  void(pspRef: string): Promise<PspResult>;
}

class SimulatedPsp implements PspProvider {
  readonly name = "simulated" as const;
  async authorize(input: { amountCents: number; requestId: string }): Promise<PspResult> {
    return { ok: true, pspRef: `sim_auth_${input.requestId.slice(0, 8)}_${Date.now().toString(36)}` };
  }
  async incrementAuthorization(pspRef: string): Promise<PspResult> {
    return { ok: true, pspRef };
  }
  async capture(pspRef: string): Promise<PspResult> {
    return { ok: true, pspRef };
  }
  async transfer(): Promise<PspResult> {
    return { ok: true, pspRef: `sim_tr_${Date.now().toString(36)}` };
  }
  async void(pspRef: string): Promise<PspResult> {
    return { ok: true, pspRef };
  }
}

class StripePsp implements PspProvider {
  readonly name = "stripe" as const;
  constructor(private readonly secretKey: string) {}

  private async call(path: string, params: Record<string, string>): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, body };
  }

  async authorize(input: { amountCents: number; requestId: string; description: string }): Promise<PspResult> {
    const { ok, body } = await this.call("payment_intents", {
      amount: String(input.amountCents),
      currency: "aud",
      capture_method: "manual",
      description: input.description,
      "metadata[request_id]": input.requestId,
    });
    if (!ok) return { ok: false, error: stripeError(body) };
    return { ok: true, pspRef: String(body.id) };
  }

  async incrementAuthorization(pspRef: string, newAmountCents: number): Promise<PspResult> {
    const { ok, body } = await this.call(`payment_intents/${pspRef}/increment_authorization`, {
      amount: String(newAmountCents),
    });
    return ok ? { ok: true, pspRef } : { ok: false, error: stripeError(body) };
  }

  async capture(pspRef: string): Promise<PspResult> {
    const { ok, body } = await this.call(`payment_intents/${pspRef}/capture`, {});
    return ok ? { ok: true, pspRef } : { ok: false, error: stripeError(body) };
  }

  async transfer(input: { amountCents: number; description: string; destination?: string | null }): Promise<PspResult> {
    if (!input.destination) {
      // No connected account on file yet — payout stays a ledger obligation.
      return { ok: false, error: "tradie has no connected account" };
    }
    const { ok, body } = await this.call("transfers", {
      amount: String(input.amountCents),
      currency: "aud",
      destination: input.destination,
      description: input.description,
    });
    return ok ? { ok: true, pspRef: String(body.id) } : { ok: false, error: stripeError(body) };
  }

  async void(pspRef: string): Promise<PspResult> {
    const { ok, body } = await this.call(`payment_intents/${pspRef}/cancel`, {});
    return ok ? { ok: true, pspRef } : { ok: false, error: stripeError(body) };
  }
}

function stripeError(body: Record<string, unknown>): string {
  const err = body.error as { message?: string } | undefined;
  return err?.message ?? "Stripe call failed";
}

let cached: PspProvider | undefined;

export function resolvePsp(): PspProvider {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    cached = key ? new StripePsp(key) : new SimulatedPsp();
  }
  return cached;
}
