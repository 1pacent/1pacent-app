# Zaivo — PM Pricing & Commercialisation Rationale v1

*Why the PM subscription curve is what it is. Companion to
PRODUCT_STRATEGY_v9.md §6–7. Status: live in the billing console 2026-07-21.*

---

## 1. The principle

Price on **value delivered to the PM**, not on cost. The value is the
operational labour Zaivo removes (quote-chasing, approval-chasing,
coordination, reconciliation) plus a stack of softer wins. The curve must:

1. **Scale** — capture materially more from large portfolios (their absolute
   savings are large; don't leave money on the table).
2. **Stay monotonic** — effective $/door must never *rise* as a portfolio
   grows. Enterprises get the best unit price, not the worst.
3. **Stay sellable** — every tier's $/door sits below the demonstrable
   per-door saving, so ROI is always visible.

## 2. The value anchor (deliberately conservative)

- **4 maintenance jobs / property / year** (typical rental).
- **~45 min of PM admin removed per job** (sourcing/chasing quotes, chasing
  landlord approval, coordinating access, reconciling the invoice).
- → **3 hours / property / year** of admin removed = **0.25 hr/property/month**.
- At a loaded property-officer cost of **~$40/hr**: **~$10 / door / month** of
  *hard* labour saved. At $50/hr: ~$12.50.

This **$10/door/month** is a **floor** — it counts only labour, ignoring:
compliance never missed (avoided fines), fewer landlord disputes, faster
resolution (tenant retention), reduced officer burnout/turnover, and winning
new management contracts by offering the capability. True value is higher; we
price against the floor so the sale is honest.

## 3. The curve (live)

Monthly = **base fee + per-property × cap**. SKUs `PRD-1P-004-*`.

| Tier | Base | Per-door | Cap | **Monthly** | $/door | Value/mo* | ROI | Capture |
|---|---|---|---|---|---|---|---|---|
| 20 | $60 | $6 | 20 | **$180** | $9.00 | $200 | 1.1× | 90% |
| 50 | $125 | $5 | 50 | **$375** | $7.50 | $500 | 1.3× | 75% |
| 100 | $200 | $4 | 100 | **$600** | $6.00 | $1,000 | 1.7× | 60% |
| 200 | $300 | $3.50 | 200 | **$1,000** | $5.00 | $2,000 | 2.0× | 50% |
| 300 | $450 | $3 | 300 | **$1,350** | $4.50 | $3,000 | 2.2× | 45% |
| 400 | $500 | $3 | 400 | **$1,700** | $4.25 | $4,000 | 2.4× | 42% |
| 500 | $550 | $3 | 500 | **$2,050** | $4.10 | $5,000 | 2.4× | 41% |
| 750 | $750 | $3 | 750 | **$3,000** | $4.00 | $7,500 | 2.5× | 40% |
| 1000 | $1,000 | $3 | 1000 | **$4,000** | $4.00 | $10,000 | 2.5× | 40% |

*\*Value/mo = cap × $10 (hard labour only).*

## 4. Why this shape is right

- **$/door declines then plateaus** ($9.00 → $4.00), never inverting. The old
  curve inverted (500-tier at $6/door > 300-tier at $4) because a $2,000 base
  fee at the 500-tier broke the slope; that is fixed.
- **ROI *improves* with size** (1.1× → 2.5×). The largest, highest-value deals
  are the easiest to justify — the enterprise buyer sees both a lower unit
  price *and* a bigger return.
- **Capture scales without greed.** At 1,000 doors we bill $4,000/mo — 40% of
  the $10k/mo *hard* saving, and only ~25% of true (soft-inclusive) value,
  leaving the customer a 2.5× return. That is the "don't leave money on the
  table, but keep it sellable" balance.
- **Small tiers are land tiers.** 20/50 ($180/$375) sit under the $199–299
  comfort band and below the $10/door value line, so ROI stays positive — but
  the base fee eats most of the (small) hard saving, so margin is thin. That
  is deliberate: win the 80% of small operators, expand later; the thin
  margin is covered by the uncounted soft benefits and cost-to-serve recovery.
- **The 750-tier** was added to close the 500→1000 gap: without it a 650-door
  agency jumped straight to the 1,000 tier. Now the largest cliff is smaller
  and the curve is smooth across the whole range.
- **"From $3/door" marginal** — every added door in the mid-large range costs
  $3, so a growing agency's bill rises smoothly (good for expansion revenue
  and retention).

## 5. Levers (documented for future tuning)

- **Push capture higher at the top:** lift the plateau from $4.00 to ~$4.50/
  door (+~$500/mo at 1,000 doors) — ROI stays >2×. Trade-off: slightly weaker
  volume-discount story.
- **Improve small-tier ROI:** lower 20/50 further — trade-off: base-fee
  viability / cost-to-serve recovery weakens.
- Both are single edits in the billing console (base + per-property per tier),
  pushed to Stripe + HubSpot.

## 6. Dependencies

At these prices you sell on the **number**, not on "cheap." This makes the
**PM Savings Dashboard / calculator** (jobs × 45 min × their rate, shown
against the fee) the feature that closes deals — see the site savings
calculator (self-serve) and the committed in-app Savings Ledger
(PRODUCT_STRATEGY_v9 §7.2).

## 7. Transaction fee (separate line)

5% of settled job value, **deducted from settled value** (customer sees one
clean price; tradie receives the remainder). Covers Stripe rails + job-side
margin. Configurable in the billing console (`billing_settings`). Tradies pay
no subscription at launch (supply subsidy).
