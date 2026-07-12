import { formatCents, type RequestCategory, type RequestState } from "@1pacent/core";
import type {
  AssetHorizonView,
  AutoQuoteSettingsView,
  CanvasCard,
  ComplianceStatusView,
  ObligationsCalendarView,
  OwnerPortalContext,
  RankedQuoteOption,
  ReportKind,
  RequestView,
  SlotOption,
  SpendingSummaryView,
  TenantRequestStatus,
  TradieAccuracyView,
  TradieJobSummary,
} from "./data-types";

/**
 * The canvas card derivation (Product Design v6 §2, Developer Brief v6 §4).
 * Shared by BOTH data sources — each store gathers its normalized inputs and
 * calls these builders, so demo/Supabase parity is structural, not a
 * convention. Deterministic projections of DB state: no table backs a card,
 * no LLM contributes a word.
 */

export interface CanvasSlotInfo {
  requestId: string;
  workOrderId: string;
  tradieName: string;
  options: SlotOption[];
}

export interface WarrantyCatchInfo {
  requestId: string;
  title: string;
  tradieName: string;
  savedApproxCents: number | null;
  at: string;
}

export interface QuotePickInfo {
  requestId: string;
  title: string;
  estimateCents: number | null;
  quotes: RankedQuoteOption[];
  at: string;
}

export interface ReportListing {
  id: string;
  kind: ReportKind;
  createdAt: string;
}

function categoryLabel(category: RequestCategory): string {
  return category.replace(/_/g, " ");
}

function stateLabel(state: RequestState): string {
  return state.replace(/_/g, " ");
}

function lastEventAt(r: RequestView): string {
  return r.events[r.events.length - 1]?.at ?? new Date().toISOString();
}

const DONE_STATES = ["closed", "cancelled"];

function ticketCard(r: RequestView, workspaceHref: string): CanvasCard {
  return {
    id: `ticket-${r.id}`,
    kind: "ticket_status",
    title: r.title,
    body: r.isWarrantyClaim
      ? "Covered by an open warranty — routed straight back to the original tradie, free, no approval needed."
      : `${categoryLabel(r.category)} — ${stateLabel(r.state)}`,
    at: lastEventAt(r),
    state: DONE_STATES.includes(r.state) ? "done" : "live",
    data: {
      kind: "ticket_status",
      requestId: r.id,
      state: r.state,
      category: r.category,
      isWarrantyClaim: r.isWarrantyClaim,
    },
    workspaceHref,
  };
}

function slotCard(slot: CanvasSlotInfo, requestTitle: string, at: string, workspaceHref: string): CanvasCard {
  return {
    id: `slot-${slot.workOrderId}`,
    kind: "slot_confirm",
    title: `George proposes a time for "${requestTitle}"`,
    body: `${slot.tradieName} can come ${slot.options[0]?.label ?? "soon"} — suits?`,
    at,
    state: "needs_you",
    data: {
      kind: "slot_confirm",
      requestId: slot.requestId,
      workOrderId: slot.workOrderId,
      tradieName: slot.tradieName,
      options: slot.options,
    },
    workspaceHref,
  };
}

export function buildTenantCanvas(input: {
  token: string;
  requests: TenantRequestStatus[];
  slots: CanvasSlotInfo[];
  compliance: ComplianceStatusView[];
}): CanvasCard[] {
  const cards: CanvasCard[] = [];
  const workspaceHref = `/r/${input.token}`;

  for (const r of input.requests) {
    cards.push(ticketCard(r, workspaceHref));

    const slot = input.slots.find((s) => s.requestId === r.id);
    if (r.state === "scheduled" && slot && slot.options.length > 0) {
      cards.push(slotCard(slot, r.title, lastEventAt(r), workspaceHref));
    }

    if (r.state === "evidence_pending") {
      cards.push({
        id: `fixed-${r.id}`,
        kind: "confirm_fixed",
        title: `Is "${r.title}" actually fixed?`,
        body: "The tradie marked this done. One tap confirms it — that's what closes the loop.",
        at: lastEventAt(r),
        state: "needs_you",
        data: { kind: "confirm_fixed", requestId: r.id },
        workspaceHref,
      });
    }
  }

  for (const c of input.compliance) {
    const nonGreen = c.requirements.filter((r) => r.status !== "green");
    cards.push({
      id: `compliance-${c.propertyAddress}`,
      kind: "insight",
      title: c.overall === "green" ? "Your home's safety checks are up to date" : "Safety checks status",
      body:
        c.overall === "green"
          ? "Smoke alarms, gas and electrical are all within their check windows."
          : `${nonGreen.length} check${nonGreen.length === 1 ? " is" : "s are"} due or overdue — your rental provider has been flagged.`,
      at: new Date().toISOString(),
      state: "info",
      data: {
        kind: "insight",
        insightKind: "compliance",
        lines: c.requirements.map(
          (r) =>
            `${r.name}: ${r.status}${r.dueAt ? ` (due ${new Date(r.dueAt).toLocaleDateString("en-AU")})` : ""}`,
        ),
      },
      workspaceHref,
    });
  }

  return sortCards(cards);
}

export function buildOwnerCanvas(input: {
  token: string;
  ctx: OwnerPortalContext;
  quotePicks: QuotePickInfo[];
  slots: CanvasSlotInfo[];
  warrantyCatches: WarrantyCatchInfo[];
  horizon: AssetHorizonView[];
  spending: SpendingSummaryView | null;
  reports: ReportListing[];
}): CanvasCard[] {
  const cards: CanvasCard[] = [];

  for (const property of input.ctx.properties) {
    const workspaceHref = `/properties/${property.id}`;
    for (const r of property.requests) {
      cards.push(ticketCard(r, workspaceHref));

      const slot = input.slots.find((s) => s.requestId === r.id);
      if (r.state === "scheduled" && slot && slot.options.length > 0) {
        cards.push(slotCard(slot, r.title, lastEventAt(r), workspaceHref));
      }

      if (r.state === "pending_approval") {
        cards.push({
          id: `approval-${r.id}`,
          kind: "approval",
          title: `Approve "${r.title}"?`,
          body: `${categoryLabel(r.category)}${r.estimateCents ? ` — estimated ${formatCents(r.estimateCents)}` : ""}. One tap either way.`,
          at: lastEventAt(r),
          state: "needs_you",
          data: { kind: "approval", requestId: r.id, estimateCents: r.estimateCents, quotes: [] },
          workspaceHref,
        });
      }
    }
  }

  for (const pick of input.quotePicks) {
    const property = input.ctx.properties.find((p) => p.requests.some((r) => r.id === pick.requestId));
    cards.push({
      id: `quotes-${pick.requestId}`,
      kind: "approval",
      title: `${pick.quotes.length} quotes in for "${pick.title}"`,
      body: "Ranked by trust, price and availability — the recommendation's working is shown.",
      at: pick.at,
      state: "needs_you",
      data: { kind: "approval", requestId: pick.requestId, estimateCents: pick.estimateCents, quotes: pick.quotes },
      workspaceHref: property ? `/properties/${property.id}` : `/o/${input.token}`,
    });
  }

  for (const w of input.warrantyCatches) {
    cards.push({
      id: `warranty-${w.requestId}`,
      kind: "warranty_catch",
      title: "Warranty catch — no decision needed",
      body: `"${w.title}" is covered by ${w.tradieName}'s warranty. Saved ~${w.savedApproxCents ? formatCents(w.savedApproxCents) : "the call-out"}; no quotes, no approval.`,
      at: w.at,
      state: "info",
      data: { kind: "warranty_catch", requestId: w.requestId, tradieName: w.tradieName, savedApproxCents: w.savedApproxCents },
      workspaceHref: `/o/${input.token}`,
    });
  }

  const planning = input.horizon.filter((a) => a.status !== "healthy");
  if (planning.length > 0) {
    cards.push({
      id: "horizon",
      kind: "insight",
      title: "Plan ahead: assets nearing end of life",
      body: planning
        .map(
          (a) =>
            `${a.assetLabel} is at year ${a.ageYears} of ${a.effectiveLifeYears}` +
            (a.plannedReplacementCents
              ? ` — planned replacement ≈ ${formatCents(a.plannedReplacementCents)} beats emergency pricing`
              : ""),
        )
        .join(" · "),
      at: new Date().toISOString(),
      state: "info",
      data: {
        kind: "insight",
        insightKind: "asset_horizon",
        lines: planning.map(
          (a) =>
            `${a.assetLabel} (${a.propertyAddress}): year ${a.ageYears} of ${a.effectiveLifeYears}, ${a.remainingLifeYears}y left [planning estimate]`,
        ),
      },
      workspaceHref: `/o/${input.token}`,
    });
  }

  if (input.spending && input.spending.jobCount > 0) {
    cards.push({
      id: "spending",
      kind: "insight",
      title: `Maintenance spend, last 12 months: ${formatCents(input.spending.totalCents)}`,
      body: input.spending.byCategory
        .map(
          (c) =>
            `${categoryLabel(c.category)}: ${formatCents(c.totalCents)}` +
            (c.vsMedianPct !== null ? ` (${c.vsMedianPct <= 0 ? "" : "+"}${c.vsMedianPct}% vs network median)` : ""),
        )
        .join(" · "),
      at: new Date().toISOString(),
      state: "info",
      data: {
        kind: "insight",
        insightKind: "spending",
        lines: input.spending.byCategory.map(
          (c) => `${categoryLabel(c.category)}: ${formatCents(c.totalCents)} across ${c.jobCount} job(s)`,
        ),
      },
      workspaceHref: `/o/${input.token}`,
    });
  }

  for (const report of input.reports.slice(-3)) {
    cards.push(reportCard(report, `/o/${input.token}/report/${report.id}`));
  }

  return sortCards(cards);
}

export function buildPmCanvas(input: {
  properties: Array<{
    id: string;
    address: string;
    suburb: string;
    overall: "green" | "amber" | "red";
    requests: RequestView[];
  }>;
  obligations: ObligationsCalendarView | null;
}): CanvasCard[] {
  const cards: CanvasCard[] = [];
  const now = new Date().toISOString();

  const open = input.properties.flatMap((p) =>
    p.requests.filter((r) => !DONE_STATES.includes(r.state)).map((r) => ({ ...r, address: p.address })),
  );
  const needsHuman = open.filter((r) => ["pending_approval", "quoting"].includes(r.state));
  cards.push({
    id: "crew-headline",
    kind: "crew_activity",
    title: `${open.length - needsHuman.length} handled by the crew · ${needsHuman.length} need a human`,
    body: open.length === 0 ? "Nothing open across the portfolio right now." : "Everything else is moving without you.",
    at: now,
    state: "info",
    data: {
      kind: "crew_activity",
      lines: open.map((r) => `${r.title} (${r.address}): ${stateLabel(r.state)}`),
    },
    workspaceHref: "/dashboard",
  });

  if (input.obligations && input.obligations.totalObligations > 0) {
    cards.push({
      id: "obligations",
      kind: "obligations",
      title: `${input.obligations.totalObligations} compliance obligations in the next ${input.obligations.horizonDays} days`,
      body: input.obligations.months.map((m) => `${m.month}: ${m.items.length} due`).join(" · "),
      at: now,
      state: "info",
      data: {
        kind: "obligations",
        totalObligations: input.obligations.totalObligations,
        months: input.obligations.months.map((m) => ({
          month: m.month,
          count: m.items.length,
          lines: m.items.map((i) => `${i.requirementName} — ${i.propertyAddress} (${i.status})`),
        })),
      },
      workspaceHref: "/dashboard",
    });

    for (const b of input.obligations.batchable) {
      cards.push({
        id: `batch-${b.requirementKey}-${b.suburb}`,
        kind: "batch_offer",
        title: `${b.propertyAddresses.length}× ${b.requirementName} — ${b.suburb.split(" ")[0]}`,
        body: "Due within a shared window. Batch them into one quote round for a negotiated rate.",
        at: now,
        state: "needs_you",
        data: {
          kind: "batch_offer",
          requirementKey: b.requirementKey,
          requirementName: b.requirementName,
          suburb: b.suburb,
          propertyAddresses: b.propertyAddresses,
          windowStart: b.windowStart,
          windowEnd: b.windowEnd,
        },
        workspaceHref: "/dashboard",
      });
    }
  }

  const red = input.properties.filter((p) => p.overall === "red");
  if (red.length > 0) {
    cards.push({
      id: "red-list",
      kind: "insight",
      title: `${red.length} propert${red.length === 1 ? "y is" : "ies are"} red right now`,
      body: red.map((p) => p.address).join(" · "),
      at: now,
      state: "info",
      data: { kind: "insight", insightKind: "red_list", lines: red.map((p) => `${p.address}, ${p.suburb}`) },
      workspaceHref: "/dashboard",
    });
  }

  return sortCards(cards);
}

export function buildTradieCanvas(input: {
  token: string;
  jobs: Array<TradieJobSummary & { scheduledLabel: string | null; briefing: string[] }>;
  accuracy: TradieAccuracyView | null;
  autoQuote: AutoQuoteSettingsView | null;
}): CanvasCard[] {
  const cards: CanvasCard[] = [];
  const now = new Date().toISOString();
  const workspaceHref = `/t/${input.token}`;

  cards.push({
    id: "day",
    kind: "insight",
    title:
      input.jobs.length === 0
        ? "No jobs on the board today"
        : `Your day: ${input.jobs.length} job${input.jobs.length === 1 ? "" : "s"}`,
    body:
      input.jobs.length === 0
        ? "New invites land here the moment they're dispatched."
        : "Property briefings attached — arrive already knowing the site.",
    at: now,
    state: "info",
    data: {
      kind: "insight",
      insightKind: "day",
      lines: input.jobs.flatMap((j) => [
        `${j.requestTitle} — ${j.propertyAddress} (${stateLabel(j.state)})${j.scheduledLabel ? ` · ${j.scheduledLabel}` : ""}`,
        ...j.briefing.map((b) => `  · site: ${b}`),
      ]),
    },
    workspaceHref,
  });

  if (input.accuracy && input.accuracy.completedJobs > 0) {
    cards.push({
      id: "accuracy",
      kind: "insight",
      title: `Quote accuracy: ±${input.accuracy.avgAbsVariancePct?.toFixed(0) ?? 0}% over ${input.accuracy.completedJobs} job${input.accuracy.completedJobs === 1 ? "" : "s"}`,
      body: `Trust score ${input.accuracy.trustScore}/100 — accuracy is what moves your ranking in quote rounds.`,
      at: now,
      state: "info",
      data: {
        kind: "insight",
        insightKind: "accuracy",
        lines: input.accuracy.recentJobs.map(
          (j) =>
            `${j.requestTitle}: quoted ${formatCents(j.quoteCents)}, invoiced ${formatCents(j.invoiceCents)} (${j.variancePct >= 0 ? "+" : ""}${j.variancePct}%)`,
        ),
      },
      workspaceHref,
    });
  }

  cards.push({
    id: "auto-quote",
    kind: "insight",
    title: input.autoQuote?.enabled ? "Nelly's auto-quote is ON" : "Nelly's auto-quote is off",
    body: input.autoQuote?.enabled
      ? `Standard quotes submit from your rate card the moment an invite lands${input.autoQuote.maxTotalCents ? `, capped at ${formatCents(input.autoQuote.maxTotalCents)}` : ""}. Every submission is attributed and visible.`
      : "Opt in and Nelly submits your standard rate-card quote the instant an invite lands — win jobs while you're on the tools.",
    at: now,
    state: "info",
    data: { kind: "insight", insightKind: "day", lines: [] },
    workspaceHref,
  });

  return sortCards(cards);
}

const REPORT_TITLES: Record<ReportKind, string> = {
  property_data_pack: "Property Data Pack",
  spending_summary: "Spending summary",
  obligations_calendar: "Obligations calendar",
  pm_quarterly: "Quarterly report",
  compliance_pack: "Compliance Evidence Pack",
  accuracy_report: "Accuracy report",
};

function reportCard(report: ReportListing, href: string): CanvasCard {
  return {
    id: `report-${report.id}`,
    kind: "report",
    title: `${REPORT_TITLES[report.kind]} — ready`,
    body:
      report.kind === "property_data_pack"
        ? "Verified asset ages, full history, warranties, compliance and planning-estimate depreciation. Not a tax schedule — the data feed that makes your accountant's job trivial."
        : "Generated from the ledger — open to view or print.",
    at: report.createdAt,
    state: "done",
    data: { kind: "report", reportId: report.id, reportKind: report.kind },
    workspaceHref: href,
  };
}

const CARD_STATE_ORDER: Record<CanvasCard["state"], number> = { needs_you: 0, live: 1, done: 2, info: 3 };

function sortCards(cards: CanvasCard[]): CanvasCard[] {
  return cards.sort(
    (a, b) => CARD_STATE_ORDER[a.state] - CARD_STATE_ORDER[b.state] || Date.parse(b.at) - Date.parse(a.at),
  );
}
