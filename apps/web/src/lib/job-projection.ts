import {
  arcStepFor,
  formatSlot,
  getPlaybook,
  playbookForCategory,
  unsatisfiedGates,
  JOB_ARC,
  type EvidenceItem,
  type JobArcStep,
  type PaymentState,
  type RequestEvent,
} from "@1pacent/core";
import type { JobAction, JobEvidenceView, JobProjection, JobViewer, RequestView, VarianceView } from "./data-types";

/**
 * The shared Job Screen projector (Developer Brief v8 §3): one function, a
 * `viewer` argument, four honest projections of the same truth. Used by BOTH
 * stores — parity is structural. Money visibility is enforced HERE, so a
 * token that shouldn't see amounts structurally cannot.
 */

export interface JobSource {
  request: RequestView & { playbookKey: string | null; bookedSlot: { startAt: string; endAt: string } | null };
  propertyAddress: string;
  workOrder: {
    id: string;
    onTheWayAt: string | null;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    completionNote: string | null;
  } | null;
  tradie: { name: string; verified: boolean } | null;
  ownerName: string | null;
  pmName: string | null;
  occupantName: string | null;
  payment: { status: PaymentState; amountCents: number; payoutCents: number | null } | null;
  evidence: JobEvidenceView[];
  /** Latest variance on this job, if any (v8 R3). */
  variance: VarianceView | null;
}

const ARC_LABELS: Record<JobArcStep, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  on_the_way: "On the way",
  on_site: "On site",
  done: "Done",
  verified: "Verified",
  paid: "Paid",
};

const EVENT_LABELS: Partial<Record<RequestEvent, string>> = {
  triage: "Reported",
  auto_approve: "Approved",
  approve: "Approved",
  request_quotes: "Finding your tradie",
  accept_quote: "Tradie confirmed",
  schedule: "Scheduled",
  start_work: "On site",
  submit_evidence: "Work done",
  verify: "Verified",
  invoice: "Settled",
  record_payment: "Paid",
  close: "Closed",
};

export function projectJob(source: JobSource, viewer: JobViewer): JobProjection {
  const { request } = source;
  const playbook =
    (request.playbookKey ? getPlaybook(request.playbookKey) : null) ?? playbookForCategory(request.category);

  const captured =
    source.payment !== null && (source.payment.status === "captured" || source.payment.status === "transferred");
  const arcStep = arcStepFor(request.state, {
    onTheWay: Boolean(source.workOrder?.onTheWayAt),
    captured,
  });
  const arcIndex = JOB_ARC.indexOf(arcStep);
  const arc = JOB_ARC.map((key, i) => ({
    key,
    label: ARC_LABELS[key],
    done: i < arcIndex,
    active: i === arcIndex,
  }));

  const parties: JobProjection["parties"] = [];
  if (source.occupantName) parties.push({ role: "customer", name: source.occupantName, verified: false });
  if (source.ownerName) parties.push({ role: "owner", name: source.ownerName, verified: false });
  if (source.pmName) parties.push({ role: "pm", name: source.pmName, verified: false });
  if (source.tradie) parties.push({ role: "tradie", name: source.tradie.name, verified: source.tradie.verified });

  // Money visibility is a structural rule, not copy.
  let money: JobProjection["money"];
  if (!source.payment) {
    money = { visible: false, amountCents: null, payoutCents: null, status: "none", label: "Quoted job — price on acceptance" };
  } else if (viewer === "tradie") {
    money = {
      visible: true,
      amountCents: null,
      payoutCents: source.payment.payoutCents,
      status: source.payment.status,
      label:
        source.payment.status === "transferred"
          ? "Paid out — same day"
          : source.payment.status === "captured"
            ? "Captured — payout on the way"
            : "Your payout, locked at booking",
    };
  } else if (viewer === "occupant") {
    money = {
      visible: false,
      amountCents: null,
      payoutCents: null,
      status: source.payment.status,
      label: "No cost to you — covered by your rental provider",
    };
  } else {
    money = {
      visible: true,
      amountCents: source.payment.amountCents,
      payoutCents: null,
      status: source.payment.status,
      label:
        source.payment.status === "authorized"
          ? "Authorized — charged only when you say it's done"
          : source.payment.status === "captured" || source.payment.status === "transferred"
            ? "Charged on your verification"
            : "Authorization released",
    };
  }

  const slotRaw = source.workOrder?.scheduledStartAt
    ? { startAt: source.workOrder.scheduledStartAt, endAt: source.workOrder.scheduledEndAt ?? source.workOrder.scheduledStartAt }
    : request.bookedSlot;
  const slot = slotRaw
    ? { ...slotRaw, label: formatSlot({ startAt: new Date(slotRaw.startAt), endAt: new Date(slotRaw.endAt) }) }
    : null;

  const evidenceItems: EvidenceItem[] = source.evidence.map((e) => ({
    gate: e.gate as EvidenceItem["gate"],
    at: new Date(e.at),
  }));
  const gatesRemaining = unsatisfiedGates(playbook, evidenceItems);

  const timeline = request.events
    .filter((e) => EVENT_LABELS[e.eventType])
    .map((e) => ({ label: EVENT_LABELS[e.eventType]!, at: e.at ?? null }));

  const pendingVariance = source.variance?.status === "pending" ? source.variance : null;

  const actions: JobAction[] = [];
  if (viewer === "tradie" && source.workOrder) {
    if (request.state === "scheduled" && !source.workOrder.onTheWayAt) actions.push("on_my_way");
    if (request.state === "scheduled") actions.push("start");
    if (request.state === "in_progress") {
      actions.push("add_evidence");
      // Work pauses on a pending variance — the payer decides before more
      // scope lands (v8 §4).
      if (!pendingVariance) {
        actions.push("mark_done");
        actions.push("propose_variance");
      }
    }
  }
  if ((viewer === "payer" || viewer === "occupant" || viewer === "pm") && request.state === "evidence_pending") {
    actions.push("verify");
  }
  if ((viewer === "payer" || viewer === "pm") && pendingVariance) {
    actions.push("decide_variance");
  }

  return {
    requestId: request.id,
    workOrderId: source.workOrder?.id ?? null,
    title: request.title,
    playbookKey: request.playbookKey,
    playbookTitle: playbook.title,
    category: request.category,
    state: request.state,
    viewer,
    propertyAddress: source.propertyAddress,
    arcStep,
    arc,
    parties,
    money,
    slot,
    onTheWayAt: source.workOrder?.onTheWayAt ?? null,
    evidence: source.evidence,
    gatesRemaining,
    timeline,
    actions,
    // Variances carry dollar figures — the occupant's projection drops them
    // entirely (money is the payer's business, structurally).
    variance: viewer === "occupant" ? null : source.variance,
  };
}
