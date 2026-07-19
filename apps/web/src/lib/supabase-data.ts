import "server-only";
import {
  arcStepFor,
  assertCents,
  assessAssetHorizon,
  bookableAmountFromBand,
  buildObligationsCalendar,
  buildRun,
  checkPlaybookGate,
  computeBatchableCompliance,
  decideApproval,
  earliestSlotStart,
  estimateDepreciation,
  estimatePriceBand,
  evaluateApprovalPolicy,
  evaluateProperty,
  findWarrantyMatch,
  formatSlot,
  getPlaybook,
  hashToken,
  isUrgentCategory,
  issueToken,
  paymentScheduleFor,
  playbookForCategory,
  projectState,
  proposeSlots,
  rankQuotes,
  scoreAvailability,
  scoreTrust,
  splitPayment,
  splitPaymentWithFastPay,
  summariseSpending,
  transition,
  unsatisfiedGates,
  blendedAccuracyPct,
  computeTimeAccuracy,
  countsTowardQuoteAccuracy,
  countsTowardTimeAccuracy,
  decideFunding,
  etaMinutesFromDistance,
  haversineKm,
  scoreTips,
  scoreTrustWithFeedback,
  validateQuoteSubmission,
  validateToken,
  varianceNeedsApproval,
  PLAYBOOKS,
  REQUEST_EVENTS,
  type ActorType,
  type ApprovalPolicyRule,
  type EvidenceRecord,
  type EvidenceItem as PlaybookEvidenceItem,
  type PaymentState,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
  type RunJob,
  type TokenScope,
} from "@1pacent/core";
import { serviceClient } from "./supabase";
import { resolvePsp } from "./payments";
import { listPmTiers, recordSubscriptionDeal } from "./hubspot";
import {
  buildOwnerCanvas,
  buildPmCanvas,
  buildTenantCanvas,
  buildTradieCanvas,
  type CanvasSlotInfo,
  type QuotePickInfo,
  type ReportListing,
  type WarrantyCatchInfo,
} from "./canvas";
import { projectJob, type JobSource } from "./job-projection";
import type {
  AcceptQuoteResult,
  AddressRecordView,
  ApprovalContext,
  ApprovalPolicyRuleInput,
  ApprovalPolicyRuleView,
  AssetHorizonView,
  BookingPreview,
  BookJobInput,
  BookJobResult,
  DeckTile,
  JobOfferView,
  JobProjection,
  JobViewer,
  MomentActionKind,
  AutoQuoteSettingsView,
  CanvasCard,
  ComplianceStatusView,
  DataSource,
  GeneratedReportView,
  ObligationsCalendarView,
  OwnerPortalContext,
  RankedQuoteOption,
  ReportKind,
  SpendingSummaryView,
  TradieAccuracyView,
  VarianceView,
  PerformanceView,
  DispatchQuotesResult,
  IntakeContext,
  InvoiceJobInput,
  MintLinkResult,
  OccupancyStatus,
  PmPortfolioContext,
  PropertyDetail,
  PropertySummary,
  QuoteContext,
  QuoteInvite,
  QuoteSummary,
  RateCard,
  RateCardItem,
  RequestView,
  SallyConversationContext,
  SallyExtractionInput,
  SallyMemoryChunkView,
  SallyMessageView,
  TenantRequestStatus,
  TradieJobSummary,
  TestLinkTargets,
  TradieLeadConversationContext,
  TradieLeadExtractionInput,
  TradieLeadSummary,
  TradiePortalContext,
} from "./data-types";

/**
 * Supabase-backed data source. Runs with the service role inside the API
 * tier only; every query is explicitly scoped by id/token — tokens are
 * looked up by SHA-256 hash and validated with @1pacent/core before any
 * row is touched. Status transitions append to `events` first (source of
 * truth), then update the projection column.
 */

interface PropertyRow {
  id: string;
  address_line1: string;
  suburb: string;
  state: string;
  postcode: string;
  jurisdiction: "VIC" | "NSW" | "QLD";
  has_gas: boolean;
  has_pool: boolean;
  auto_approve_cap_cents: number;
  org_id: string;
  occupancy_status?: "owner_occupied" | "tenanted" | "vacant";
  owner_contact_id?: string | null;
}

interface CertRow {
  requirement_key: string;
  completed_at: string;
  expires_at: string | null;
}

interface RequestRow {
  id: string;
  org_id: string;
  property_id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  estimate_cents: number | null;
  reported_at: string;
  warranty_claim_of_work_order_id?: string | null;
}

interface EventRow {
  aggregate_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function toEvidence(certs: CertRow[]): EvidenceRecord[] {
  return certs.map((c) => ({
    requirementKey: c.requirement_key,
    completedAt: new Date(c.completed_at),
    ...(c.expires_at ? { expiresAt: new Date(c.expires_at) } : {}),
  }));
}

const OPEN_EXCLUDED = ["closed", "cancelled"];

function toRequestView(row: RequestRow, events: EventRow[]): RequestView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as RequestCategory,
    estimateCents: row.estimate_cents,
    state: row.status as RequestState,
    isWarrantyClaim: Boolean(row.warranty_claim_of_work_order_id),
    events: events
      .filter((e) => e.aggregate_id === row.id)
      .map((e) => ({
        eventType: e.event_type as RequestEvent,
        actorType: e.actor_type as ActorType,
        note: typeof e.payload?.note === "string" ? e.payload.note : undefined,
        at: e.created_at,
      })),
  };
}

export const supabaseData: DataSource = {
  async listProperties(): Promise<PropertySummary[]> {
    const db = serviceClient();
    const { data, error } = await db
      .from("properties")
      .select(
        "id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents, org_id, compliance_certificates(requirement_key, completed_at, expires_at), maintenance_requests(status)",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(`listProperties: ${error.message}`);
    const today = new Date();
    return (data as unknown as Array<
      PropertyRow & { compliance_certificates: CertRow[]; maintenance_requests: Array<{ status: string }> }
    >).map((p) => ({
      id: p.id,
      address: p.address_line1,
      suburb: `${p.suburb} ${p.state} ${p.postcode}`,
      autoApproveCapCents: Number(p.auto_approve_cap_cents),
      compliance: evaluateProperty(
        { jurisdiction: p.jurisdiction, hasGas: p.has_gas, hasPool: p.has_pool },
        toEvidence(p.compliance_certificates ?? []),
        today,
      ),
      openRequests: (p.maintenance_requests ?? []).filter((r) => !OPEN_EXCLUDED.includes(r.status))
        .length,
    }));
  },

  async getProperty(id: string): Promise<PropertyDetail | null> {
    const db = serviceClient();
    const { data: p, error } = await db
      .from("properties")
      .select(
        "id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents, org_id, occupancy_status, owner_contact_id, compliance_certificates(requirement_key, completed_at, expires_at), maintenance_requests(id, org_id, property_id, title, description, category, status, estimate_cents, reported_at, warranty_claim_of_work_order_id)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getProperty: ${error.message}`);
    if (!p) return null;
    const property = p as unknown as PropertyRow & {
      compliance_certificates: CertRow[];
      maintenance_requests: RequestRow[];
    };
    const requestIds = (property.maintenance_requests ?? []).map((r) => r.id);
    let events: EventRow[] = [];
    if (requestIds.length > 0) {
      const { data: ev, error: evError } = await db
        .from("events")
        .select("aggregate_id, event_type, actor_type, actor_id, payload, created_at")
        .eq("aggregate_type", "maintenance_request")
        .in("aggregate_id", requestIds)
        .order("id", { ascending: true });
      if (evError) throw new Error(`getProperty events: ${evError.message}`);
      events = ev as unknown as EventRow[];
    }
    const requests = (property.maintenance_requests ?? []).map((r) => toRequestView(r, events));

    const [{ data: owners }, { data: ownerRow }, { data: warrantyRows }] = await Promise.all([
      db.from("contacts").select("id, full_name").eq("org_id", property.org_id).eq("kind", "owner"),
      property.owner_contact_id
        ? db.from("contacts").select("full_name").eq("id", property.owner_contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("work_orders")
        .select("warranty_expires_at, tradie_contact_id, contacts(full_name), property_assets!inner(property_id, category, label)")
        .eq("property_assets.property_id", property.id)
        .gt("warranty_expires_at", new Date().toISOString()),
    ]);

    return {
      id: property.id,
      address: property.address_line1,
      suburb: `${property.suburb} ${property.state} ${property.postcode}`,
      autoApproveCapCents: Number(property.auto_approve_cap_cents),
      occupancyStatus: (property.occupancy_status ?? "tenanted") as PropertyDetail["occupancyStatus"],
      ownerContactId: property.owner_contact_id ?? null,
      ownerName: (ownerRow as { full_name: string } | null)?.full_name ?? null,
      availableOwners: ((owners ?? []) as Array<{ id: string; full_name: string }>).map((o) => ({
        id: o.id,
        name: o.full_name,
      })),
      openWarranties: ((warrantyRows ?? []) as Array<{
        warranty_expires_at: string;
        contacts: { full_name: string } | { full_name: string }[] | null;
        property_assets: { category: string; label: string } | { category: string; label: string }[] | null;
      }>).map((w) => {
        const tradie = Array.isArray(w.contacts) ? w.contacts[0] : w.contacts;
        const asset = Array.isArray(w.property_assets) ? w.property_assets[0] : w.property_assets;
        return {
          assetLabel: asset?.label ?? "Unknown asset",
          category: (asset?.category ?? "other") as RequestCategory,
          tradieName: tradie?.full_name ?? "Unknown",
          expiresAt: w.warranty_expires_at,
        };
      }),
      compliance: evaluateProperty(
        { jurisdiction: property.jurisdiction, hasGas: property.has_gas, hasPool: property.has_pool },
        toEvidence(property.compliance_certificates ?? []),
        new Date(),
      ),
      openRequests: requests.filter((r) => !OPEN_EXCLUDED.includes(r.state)).length,
      requests,
    };
  },

  async getIntakeContext(token: string): Promise<IntakeContext | null> {
    const resolved = await resolveToken(token, "tenant_intake");
    if (!resolved?.aggregate_id) return null;
    const property = await this.getProperty(resolved.aggregate_id);
    if (!property) return null;
    return { property: { id: property.id, address: property.address, suburb: property.suburb } };
  },

  async lodgeIntake(token, input) {
    const resolved = await resolveToken(token, "tenant_intake");
    if (!resolved?.aggregate_id) {
      return { ok: false as const, error: "This link is invalid or has expired. Ask your rental provider for a new one." };
    }
    const db = serviceClient();
    const { data: prop, error: propError } = await db
      .from("properties")
      .select("id, org_id, auto_approve_cap_cents")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (propError || !prop) return { ok: false as const, error: "Property not found for this link." };

    const urgent = isUrgentCategory(input.category);
    const decision = decideApproval({
      category: input.category,
      estimateCents: 0,
      policy: { autoApproveCapCents: Number(prop.auto_approve_cap_cents) },
    });
    const followUp: RequestEvent =
      urgent && decision.outcome === "auto_approved" ? "auto_approve" : "request_approval";
    // Validate the projected stream before persisting anything.
    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: followUp, actorType: "system" },
    ]);

    const { data: req, error: reqError } = await db
      .from("maintenance_requests")
      .insert({
        org_id: prop.org_id,
        property_id: prop.id,
        title: input.title,
        description: input.description,
        category: input.category,
        is_urgent: urgent,
        status: state,
      })
      .select("id")
      .single();
    if (reqError) return { ok: false as const, error: `Could not save the request: ${reqError.message}` };

    const base = {
      org_id: prop.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      actor_type: "system",
    };
    const { error: evError } = await db.from("events").insert([
      { ...base, event_type: "triage", actor_id: "triage-rules", payload: { source: "tenant_intake", token_id: resolved.id } },
      {
        ...base,
        event_type: followUp,
        actor_id: "approval-rules",
        payload: {
          note:
            followUp === "auto_approve"
              ? "Urgent bypass (VIC urgent repairs list)"
              : "Routed to landlord approval",
        },
      },
    ]);
    if (evError) return { ok: false as const, error: `Could not record events: ${evError.message}` };

    return { ok: true as const, requestId: req.id, state, urgent };
  },

  async getApprovalContext(token: string): Promise<ApprovalContext | null> {
    const resolved = await resolveToken(token, "landlord_approval");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, title, description, category, estimate_cents, property_id, properties(address_line1, suburb, state, postcode)")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!req) return null;
    // supabase-js types to-one joins as arrays; normalise either shape.
    const joined = (req as unknown as {
      properties?:
        | { address_line1: string; suburb: string; state: string; postcode: string }
        | Array<{ address_line1: string; suburb: string; state: string; postcode: string }>;
    }).properties;
    const prop = Array.isArray(joined) ? joined[0] : joined;
    return {
      request: {
        id: req.id,
        title: req.title,
        description: req.description,
        category: req.category as RequestCategory,
        estimateCents: req.estimate_cents,
        address: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
      },
    };
  },

  async decideApprovalByToken(token, decision) {
    const resolved = await resolveToken(token, "landlord_approval");
    if (!resolved?.aggregate_id) {
      return { ok: false as const, error: "This approval link is invalid or has expired." };
    }
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!req) return { ok: false as const, error: "Request not found." };

    const current = req.status as RequestState;
    const result = transition(current, decision, "landlord");
    if (!result.ok) {
      return { ok: false as const, error: `This request is ${current.replace(/_/g, " ")} — no decision is pending.` };
    }

    const { error: evError } = await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: decision,
      actor_type: "landlord",
      actor_id: `token:${resolved.id}`,
    });
    if (evError) return { ok: false as const, error: `Could not record the decision: ${evError.message}` };

    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    await db.from("access_tokens").update({ used_at: new Date().toISOString() }).eq("id", resolved.id);
    return { ok: true as const, state: result.state };
  },

  async decideApprovalByRequestId(requestId, decision) {
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false as const, error: "Request not found." };

    const current = req.status as RequestState;
    const result = transition(current, decision, "landlord");
    if (!result.ok) {
      return { ok: false as const, error: `This request is ${current.replace(/_/g, " ")} — no decision is pending.` };
    }

    const { error: evError } = await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: decision,
      actor_type: "landlord",
      actor_id: "dashboard",
    });
    if (evError) return { ok: false as const, error: `Could not record the decision: ${evError.message}` };

    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    return { ok: true as const, state: result.state };
  },

  async startSallyConversation(token: string): Promise<SallyConversationContext | null> {
    const resolved = await resolveToken(token, "tenant_intake");
    if (!resolved?.aggregate_id || !resolved.contact_id) return null;
    const db = serviceClient();
    const { data: prop } = await db
      .from("properties")
      .select("id, org_id, address_line1, suburb, state, postcode")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!prop) return null;
    const { data: contact } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", resolved.contact_id)
      .maybeSingle();

    const { data: existing } = await db
      .from("sally_conversations")
      .select("id")
      .eq("contact_id", resolved.contact_id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId = existing?.id as string | undefined;
    if (!conversationId) {
      const { data: created, error } = await db
        .from("sally_conversations")
        .insert({ org_id: prop.org_id, contact_id: resolved.contact_id, property_id: prop.id })
        .select("id")
        .single();
      if (error) throw new Error(`startSallyConversation: ${error.message}`);
      conversationId = created.id as string;
    }

    return {
      conversationId,
      contactId: resolved.contact_id,
      propertyId: prop.id,
      propertyAddress: prop.address_line1,
      propertySuburb: `${prop.suburb} ${prop.state} ${prop.postcode}`,
      tenantFirstName: (contact?.full_name as string | undefined)?.split(" ")[0],
    };
  },

  async appendSallyMessage(conversationId: string, role: "tenant" | "sally", content: string): Promise<void> {
    const db = serviceClient();
    const { data: convo } = await db
      .from("sally_conversations")
      .select("org_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo) throw new Error("appendSallyMessage: conversation not found");
    const { error } = await db
      .from("sally_messages")
      .insert({ org_id: convo.org_id, conversation_id: conversationId, role, content });
    if (error) throw new Error(`appendSallyMessage: ${error.message}`);
  },

  async getSallyMessages(conversationId: string): Promise<SallyMessageView[]> {
    const db = serviceClient();
    const { data, error } = await db
      .from("sally_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`getSallyMessages: ${error.message}`);
    return (data ?? []) as SallyMessageView[];
  },

  async retrieveSallyMemory(contactId: string, queryEmbedding: number[]): Promise<SallyMemoryChunkView[]> {
    if (queryEmbedding.length === 0) return [];
    const db = serviceClient();
    const { data, error } = await db.rpc("match_sally_memory", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_contact_id: contactId,
      match_count: 5,
    });
    if (error) throw new Error(`retrieveSallyMemory: ${error.message}`);
    return ((data ?? []) as Array<{ content: string }>).map((r) => ({ content: r.content }));
  },

  async writeSallyMemory(params): Promise<void> {
    const { conversationId, contactId, propertyId, chunks } = params;
    if (chunks.length === 0) return;
    const db = serviceClient();
    const { data: convo } = await db
      .from("sally_conversations")
      .select("org_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo) throw new Error("writeSallyMemory: conversation not found");
    const rows = chunks.map((c) => ({
      org_id: convo.org_id,
      contact_id: contactId,
      property_id: c.scopeLevel === "property" ? propertyId : null,
      scope_level: c.scopeLevel,
      chunk_type: c.chunkType,
      content: c.content,
      embedding: `[${c.embedding.join(",")}]`,
      source_conversation_id: conversationId,
    }));
    const { error } = await db.from("sally_memory_chunks").insert(rows);
    if (error) throw new Error(`writeSallyMemory: ${error.message}`);
  },

  async completeSallyConversation(conversationId: string, extraction: SallyExtractionInput) {
    const db = serviceClient();
    const { data: convo } = await db
      .from("sally_conversations")
      .select("id, org_id, contact_id, property_id, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo) return { ok: false as const, error: "Conversation not found." };
    if (convo.status === "completed") {
      return { ok: false as const, error: "This conversation has already been completed." };
    }

    const { data: prop } = await db
      .from("properties")
      .select("id, org_id, auto_approve_cap_cents")
      .eq("id", convo.property_id)
      .maybeSingle();
    if (!prop) return { ok: false as const, error: "Property not found." };

    // Warranty-aware routing (Developer Brief v4 §2): if an already-completed
    // job on this property, same category, is still under warranty, skip the
    // urgent/approval gate and the 3-quote marketplace entirely — route
    // straight back to the original tradie.
    const { data: warrantyRows } = await db
      .from("work_orders")
      .select("id, tradie_contact_id, warranty_expires_at, property_assets!inner(id, property_id, category)")
      .eq("property_assets.property_id", prop.id)
      .not("warranty_expires_at", "is", null);
    const warrantyCandidates = ((warrantyRows ?? []) as Array<{
      id: string;
      tradie_contact_id: string;
      warranty_expires_at: string;
      property_assets: { id: string; category: string } | { id: string; category: string }[] | null;
    }>)
      .map((w) => {
        const asset = Array.isArray(w.property_assets) ? w.property_assets[0] : w.property_assets;
        return asset
          ? {
              workOrderId: w.id,
              tradieContactId: w.tradie_contact_id,
              assetId: asset.id,
              category: asset.category as RequestCategory,
              warrantyExpiresAt: new Date(w.warranty_expires_at),
            }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const warrantyMatch = findWarrantyMatch(warrantyCandidates, extraction.category, new Date());

    const urgent = isUrgentCategory(extraction.category);
    const decision = decideApproval({
      category: extraction.category,
      estimateCents: 0,
      policy: { autoApproveCapCents: Number(prop.auto_approve_cap_cents) },
    });
    const followUp: RequestEvent = warrantyMatch
      ? "auto_approve"
      : urgent && decision.outcome === "auto_approved"
        ? "auto_approve"
        : "request_approval";
    const eventChain: Array<{ eventType: RequestEvent; actorType: ActorType }> = warrantyMatch
      ? [
          { eventType: "triage", actorType: "system" },
          { eventType: "auto_approve", actorType: "system" },
          { eventType: "schedule", actorType: "system" },
        ]
      : [
          { eventType: "triage", actorType: "system" },
          { eventType: followUp, actorType: "system" },
        ];
    const state = projectState(eventChain);

    const { data: req, error: reqError } = await db
      .from("maintenance_requests")
      .insert({
        org_id: prop.org_id,
        property_id: prop.id,
        title: extraction.title,
        description: extraction.description,
        category: extraction.category,
        is_urgent: urgent,
        status: state,
        warranty_claim_of_work_order_id: warrantyMatch?.workOrderId ?? null,
      })
      .select("id")
      .single();
    if (reqError) return { ok: false as const, error: `Could not save the request: ${reqError.message}` };

    const base = {
      org_id: prop.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      actor_type: "system",
    };
    const events = warrantyMatch
      ? [
          {
            ...base,
            event_type: "triage",
            actor_id: "sally",
            payload: { source: "sally_conversation", conversation_id: conversationId },
            ai_meta: extraction.aiMeta,
          },
          {
            ...base,
            event_type: "auto_approve",
            actor_id: "warranty-routing",
            payload: { note: "Warranty claim — routed to the original tradie, no marketplace round." },
          },
          {
            ...base,
            event_type: "schedule",
            actor_id: "warranty-routing",
            payload: { note: "Dispatched directly under an open warranty." },
          },
        ]
      : [
          {
            ...base,
            event_type: "triage",
            actor_id: "sally",
            payload: { source: "sally_conversation", conversation_id: conversationId },
            ai_meta: extraction.aiMeta,
          },
          {
            ...base,
            event_type: followUp,
            actor_id: "approval-rules",
            payload: {
              note:
                followUp === "auto_approve"
                  ? "Urgent bypass (VIC urgent repairs list)"
                  : "Routed to landlord approval",
            },
          },
        ];
    const { error: evError } = await db.from("events").insert(events);
    if (evError) return { ok: false as const, error: `Could not record events: ${evError.message}` };

    if (warrantyMatch) {
      await db.from("work_orders").insert({
        org_id: prop.org_id,
        request_id: req.id,
        tradie_contact_id: warrantyMatch.tradieContactId,
        status: "scheduled",
        quote_cents: 0,
        call_out_fee_cents: 0,
        asset_id: warrantyMatch.assetId,
      });
    }

    await db
      .from("sally_conversations")
      .update({ status: "completed", ended_at: new Date().toISOString(), request_id: req.id })
      .eq("id", conversationId);

    return { ok: true as const, requestId: req.id, state, urgent };
  },

  async dispatchQuotesForRequest(requestId: string): Promise<DispatchQuotesResult | { ok: false; error: string }> {
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, title, description, status, property_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };

    const current = req.status as RequestState;
    const result = transition(current, "request_quotes", "system");
    if (!result.ok) return { ok: false, error: `Cannot request quotes from state "${current}".` };

    const { data: prop } = await db
      .from("properties")
      .select("address_line1, suburb, state, postcode")
      .eq("id", req.property_id)
      .maybeSingle();
    const propertyAddress = prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "";

    const { data: tradies } = await db
      .from("contacts")
      .select("id, full_name, email")
      .eq("org_id", req.org_id)
      .eq("kind", "tradie")
      .order("created_at", { ascending: true })
      .limit(3);
    if (!tradies || tradies.length === 0) {
      return { ok: false, error: "No tradie contacts configured for this org." };
    }

    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "request_quotes",
      actor_type: "system",
      actor_id: "quote-dispatch",
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);

    const invites: QuoteInvite[] = [];
    for (const tradie of tradies) {
      const { data: quote, error: quoteErr } = await db
        .from("quotes")
        .insert({ org_id: req.org_id, request_id: req.id, tradie_contact_id: tradie.id, status: "invited" })
        .select("id")
        .single();
      if (quoteErr || !quote) continue;
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "quote",
        aggregate_id: quote.id,
        event_type: "quote_invited",
        actor_type: "system",
        actor_id: "quote-dispatch",
      });
      const issued = issueToken("tradie_job");
      await db.from("access_tokens").insert({
        org_id: req.org_id,
        token_hash: issued.tokenHash,
        scope: "tradie_job",
        aggregate_id: quote.id,
        contact_id: tradie.id,
        expires_at: issued.expiresAt.toISOString(),
      });
      invites.push({
        quoteId: quote.id,
        tradieContactId: tradie.id,
        tradieName: tradie.full_name,
        tradieEmail: tradie.email ?? "",
        token: issued.token,
      });
    }

    // Nelly's auto-quote (v6 §4.4): opt-in, bounded, revocable — the tradie's
    // standard rate-card quote submits the moment the invite lands, attributed
    // 'nelly:auto-quote' in the quote event, never silent.
    const { data: reqCat } = await db
      .from("maintenance_requests")
      .select("category")
      .eq("id", req.id)
      .maybeSingle();
    for (const invite of invites) {
      const card = await rateCardSuggestion(db, invite.tradieContactId, (reqCat?.category ?? "other") as RequestCategory);
      if (!card?.autoQuoteEnabled || card.suggestedQuoteCents === null) continue;
      const total = card.suggestedQuoteCents + card.callOutFeeCents;
      if (card.autoQuoteMaxTotalCents !== null && total > card.autoQuoteMaxTotalCents) continue;
      await db
        .from("quotes")
        .update({
          status: "submitted",
          quote_cents: card.suggestedQuoteCents,
          call_out_fee_cents: card.callOutFeeCents,
          note: `Auto-submitted by Nelly from ${invite.tradieName}'s rate card (opt-in, within set bounds).`,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", invite.quoteId)
        .eq("status", "invited");
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "quote",
        aggregate_id: invite.quoteId,
        event_type: "quote_submitted",
        actor_type: "system",
        actor_id: "nelly:auto-quote",
        payload: { auto: true, boundedByCents: card.autoQuoteMaxTotalCents },
        ai_meta: null,
      });
      await maybeAutoAcceptAfterQuoteRound(db, invite.quoteId);
    }

    return { ok: true, invites, requestTitle: req.title, requestDescription: req.description, propertyAddress };
  },

  async getQuoteContext(token: string): Promise<QuoteContext | null> {
    const resolved = await resolveToken(token, "tradie_job");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: quote } = await db
      .from("quotes")
      .select("id, request_id, tradie_contact_id")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!quote) return null;
    const { data: req } = await db
      .from("maintenance_requests")
      .select("title, description, property_id, category")
      .eq("id", quote.request_id)
      .maybeSingle();
    if (!req) return null;
    const { data: prop } = await db
      .from("properties")
      .select("address_line1, suburb, state, postcode")
      .eq("id", req.property_id)
      .maybeSingle();
    const { data: tradie } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", quote.tradie_contact_id)
      .maybeSingle();

    // Auto-populate from the tradie's own rate card — never AI-invented (product brief §5.4.4).
    let suggestedQuoteCents: number | undefined;
    let suggestedCallOutFeeCents: number | undefined;
    const { data: rateCard } = await db
      .from("tradie_rate_cards")
      .select("id, call_out_fee_cents, hourly_rate_cents")
      .eq("tradie_contact_id", quote.tradie_contact_id)
      .maybeSingle();
    if (rateCard) {
      suggestedCallOutFeeCents = rateCard.call_out_fee_cents;
      const { data: item } = await db
        .from("tradie_rate_card_items")
        .select("flat_price_cents, typical_minutes")
        .eq("rate_card_id", rateCard.id)
        .eq("category", req.category)
        .maybeSingle();
      if (item?.flat_price_cents != null) {
        suggestedQuoteCents = item.flat_price_cents;
      } else if (item?.typical_minutes != null) {
        suggestedQuoteCents = Math.round((rateCard.hourly_rate_cents * item.typical_minutes) / 60);
      }
    }

    return {
      quoteId: quote.id,
      requestTitle: req.title,
      requestDescription: req.description,
      propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
      tradieName: (tradie?.full_name as string | undefined) ?? "there",
      suggestedQuoteCents,
      suggestedCallOutFeeCents,
    };
  },

  async submitQuoteByToken(token: string, input: { quoteCents: number; callOutFeeCents: number; note?: string }) {
    const resolved = await resolveToken(token, "tradie_job");
    if (!resolved?.aggregate_id) {
      return { ok: false as const, error: "This quote link is invalid or has expired." };
    }
    try {
      validateQuoteSubmission({
        quoteCents: input.quoteCents,
        callOutFeeCents: input.callOutFeeCents,
        note: input.note,
      });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid quote amount." };
    }

    const db = serviceClient();
    const { data: quote } = await db
      .from("quotes")
      .select("id, org_id, status")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!quote) return { ok: false as const, error: "Quote not found." };
    if (quote.status !== "invited") {
      return { ok: false as const, error: "This quote has already been submitted or is no longer open." };
    }

    const { error } = await db
      .from("quotes")
      .update({
        status: "submitted",
        quote_cents: input.quoteCents,
        call_out_fee_cents: input.callOutFeeCents,
        note: input.note ?? null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", quote.id);
    if (error) return { ok: false as const, error: `Could not save your quote: ${error.message}` };

    await db.from("events").insert({
      org_id: quote.org_id,
      aggregate_type: "quote",
      aggregate_id: quote.id,
      event_type: "quote_submitted",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
    });
    await db.from("access_tokens").update({ used_at: new Date().toISOString() }).eq("id", resolved.id);

    // Approval policy (Developer Brief v4 §3): once every invited quote for
    // this request has resolved, rank them and check whether the property's
    // policy pre-approves the winner. Shared with the auto-quote hook.
    const autoAccepted = await maybeAutoAcceptAfterQuoteRound(db, quote.id);
    return autoAccepted ? { ok: true as const, autoAccepted } : { ok: true as const };
  },

  async listQuotesForRequest(requestId: string): Promise<QuoteSummary[]> {
    const db = serviceClient();
    const { data, error } = await db
      .from("quotes")
      .select(
        "id, tradie_contact_id, status, quote_cents, call_out_fee_cents, note, created_at, submitted_at, contacts(full_name, email)",
      )
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`listQuotesForRequest: ${error.message}`);
    return (data as unknown as QuoteJoinRow[]).map(toQuoteSummary);
  },

  async acceptQuote(requestId: string, quoteId: string): Promise<AcceptQuoteResult> {
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    return acceptQuoteTx(db, req, quoteId, "landlord", "dashboard");
  },

  async getComparableJobs(propertyId: string, category: RequestCategory) {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return [];
    const { data, error } = await db
      .from("work_orders")
      // FK hint required: two relationships exist between work_orders and
      // maintenance_requests (request_id + warranty_claim_of_work_order_id).
      .select("invoice_cents, maintenance_requests!work_orders_request_id_fkey!inner(org_id, category)")
      .eq("maintenance_requests.org_id", prop.org_id)
      .eq("maintenance_requests.category", category)
      .not("invoice_cents", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`getComparableJobs: ${error.message}`);
    return ((data ?? []) as Array<{ invoice_cents: number | null }>)
      .filter((r): r is { invoice_cents: number } => r.invoice_cents !== null)
      .map((r) => ({ finalInvoiceCents: r.invoice_cents }));
  },

  async getTypicalResponseMinutes(propertyId: string, category: RequestCategory) {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return null;
    const { data, error } = await db
      .from("quotes")
      .select("created_at, submitted_at, maintenance_requests!inner(org_id, category)")
      .eq("maintenance_requests.org_id", prop.org_id)
      .eq("maintenance_requests.category", category)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`getTypicalResponseMinutes: ${error.message}`);
    const minutes = ((data ?? []) as Array<{ created_at: string; submitted_at: string | null }>)
      .filter((r): r is { created_at: string; submitted_at: string } => r.submitted_at !== null)
      .map((r) => (new Date(r.submitted_at).getTime() - new Date(r.created_at).getTime()) / 60_000)
      .filter((m) => m > 0);
    if (minutes.length === 0) return null;
    const sorted = minutes.sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  },

  async getTradieTrustSummaries(tradieContactIds: string[]) {
    if (tradieContactIds.length === 0) return {};
    const db = serviceClient();
    // Computed directly (not the tradie_trust_scores view) so the fairness
    // rule holds: only jobs the TRADIE priced count toward quote accuracy —
    // network-priced fixed-band jobs are excluded.
    const { data, error } = await db
      .from("work_orders")
      .select("tradie_contact_id, quote_cents, invoice_cents, maintenance_requests!work_orders_request_id_fkey(playbook_key, category)")
      .in("tradie_contact_id", tradieContactIds)
      .not("invoice_cents", "is", null);
    if (error) throw new Error(`getTradieTrustSummaries: ${error.message}`);
    const agg: Record<string, { completed: number; sum: number; n: number }> = {};
    for (const row of (data ?? []) as Array<{
      tradie_contact_id: string;
      quote_cents: number | null;
      invoice_cents: number;
      maintenance_requests:
        | { playbook_key: string | null; category: string }
        | { playbook_key: string | null; category: string }[]
        | null;
    }>) {
      const a = (agg[row.tradie_contact_id] ??= { completed: 0, sum: 0, n: 0 });
      a.completed += 1;
      if (row.quote_cents === null || Number(row.quote_cents) <= 0) continue;
      const req = Array.isArray(row.maintenance_requests) ? row.maintenance_requests[0] : row.maintenance_requests;
      const pb = req?.playbook_key ? getPlaybook(req.playbook_key) : null;
      if (!countsTowardQuoteAccuracy(pb?.pricing.model ?? "quote_race")) continue; // no playbook = tradie priced
      a.sum += Math.abs(Number(row.invoice_cents) - Number(row.quote_cents)) / Number(row.quote_cents);
      a.n += 1;
    }
    // Feedback joins the ranking signal (v8 R6). Consumers call
    // scoreTrust(summary) = 100 − variance, so we fold the 70/30 blended
    // score back into an EFFECTIVE variance (100 − blendedScore) — the
    // consumer math stays untouched and every ranking sees feedback.
    const { data: ratingRows } = await db
      .from("job_reviews")
      .select("tradie_contact_id, rating")
      .in("tradie_contact_id", tradieContactIds);
    const ratingAgg: Record<string, { sum: number; n: number }> = {};
    for (const r of (ratingRows ?? []) as Array<{ tradie_contact_id: string; rating: number }>) {
      (ratingAgg[r.tradie_contact_id] ??= { sum: 0, n: 0 });
      ratingAgg[r.tradie_contact_id]!.sum += r.rating;
      ratingAgg[r.tradie_contact_id]!.n += 1;
    }
    const summaries: Record<string, { completedJobs: number; avgAbsVariancePct: number | null }> = {};
    for (const id of tradieContactIds) {
      const a = agg[id];
      const completedJobs = a?.completed ?? 0;
      const rawVariance = a && a.n > 0 ? (a.sum / a.n) * 100 : null;
      const fb = ratingAgg[id];
      if (completedJobs >= 3 && rawVariance !== null && fb && fb.n > 0) {
        const blended = scoreTrustWithFeedback(
          { completedJobs, avgAbsVariancePct: rawVariance },
          { avgRating: fb.sum / fb.n, reviewCount: fb.n },
        );
        summaries[id] = { completedJobs, avgAbsVariancePct: 100 - blended };
      } else {
        summaries[id] = { completedJobs, avgAbsVariancePct: rawVariance };
      }
    }
    // v8 R3.5: blend the time signal in, so ranking and Autopilot's trust
    // floor see the whole picture (70% money / 30% time).
    const { data: timed } = await db
      .from("work_orders")
      .select("tradie_contact_id, estimated_minutes, actual_minutes")
      .in("tradie_contact_id", tradieContactIds)
      .not("actual_minutes", "is", null)
      .not("estimated_minutes", "is", null);
    const timeAgg: Record<string, { sum: number; n: number }> = {};
    for (const w of (timed ?? []) as Array<{ tradie_contact_id: string; estimated_minutes: number; actual_minutes: number }>) {
      if (Number(w.estimated_minutes) <= 0) continue;
      const acc = computeTimeAccuracy(Number(w.estimated_minutes), Number(w.actual_minutes));
      (timeAgg[w.tradie_contact_id] ??= { sum: 0, n: 0 });
      timeAgg[w.tradie_contact_id]!.sum += acc.absVariancePct;
      timeAgg[w.tradie_contact_id]!.n += 1;
    }
    for (const [id, agg] of Object.entries(timeAgg)) {
      const existing = summaries[id] ?? { completedJobs: agg.n, avgAbsVariancePct: null };
      existing.avgAbsVariancePct = blendedAccuracyPct(existing.avgAbsVariancePct, agg.sum / agg.n);
      summaries[id] = existing;
    }
    return summaries;
  },

  async getTradiePortalContext(token: string): Promise<TradiePortalContext | null> {
    const resolved = await resolveToken(token, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const { data: contact } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", resolved.contact_id)
      .maybeSingle();
    if (!contact) return null;

    const { data: card } = await db
      .from("tradie_rate_cards")
      .select("id, call_out_fee_cents, hourly_rate_cents")
      .eq("tradie_contact_id", resolved.contact_id)
      .maybeSingle();

    let rateCard: RateCard | null = null;
    if (card) {
      const { data: items } = await db
        .from("tradie_rate_card_items")
        .select("category, flat_price_cents, typical_minutes")
        .eq("rate_card_id", card.id);
      rateCard = {
        callOutFeeCents: card.call_out_fee_cents,
        hourlyRateCents: card.hourly_rate_cents,
        items: ((items ?? []) as Array<{ category: string; flat_price_cents: number | null; typical_minutes: number | null }>).map(
          (i) => ({
            category: i.category as RequestCategory,
            flatPriceCents: i.flat_price_cents,
            typicalMinutes: i.typical_minutes,
          }),
        ),
      };
    }

    return { tradieContactId: resolved.contact_id, tradieName: contact.full_name as string, rateCard };
  },

  async saveRateCard(
    token: string,
    input: { callOutFeeCents: number; hourlyRateCents: number; items: RateCardItem[] },
  ) {
    const resolved = await resolveToken(token, "tradie_portal");
    if (!resolved?.contact_id) {
      return { ok: false as const, error: "This link is invalid or has expired." };
    }
    try {
      assertCents(input.callOutFeeCents);
      assertCents(input.hourlyRateCents);
      for (const item of input.items) {
        if (item.flatPriceCents !== null) assertCents(item.flatPriceCents);
        if (item.typicalMinutes !== null && item.typicalMinutes <= 0) {
          throw new RangeError("typicalMinutes must be positive");
        }
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid rate card values." };
    }

    const db = serviceClient();
    const { data: contact } = await db
      .from("contacts")
      .select("org_id")
      .eq("id", resolved.contact_id)
      .maybeSingle();
    if (!contact) return { ok: false as const, error: "Tradie not found." };

    const { data: existing } = await db
      .from("tradie_rate_cards")
      .select("id")
      .eq("tradie_contact_id", resolved.contact_id)
      .maybeSingle();

    let rateCardId: string;
    if (existing) {
      await db
        .from("tradie_rate_cards")
        .update({
          call_out_fee_cents: input.callOutFeeCents,
          hourly_rate_cents: input.hourlyRateCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      rateCardId = existing.id;
      await db.from("tradie_rate_card_items").delete().eq("rate_card_id", rateCardId);
    } else {
      const { data: created, error } = await db
        .from("tradie_rate_cards")
        .insert({
          org_id: contact.org_id,
          tradie_contact_id: resolved.contact_id,
          call_out_fee_cents: input.callOutFeeCents,
          hourly_rate_cents: input.hourlyRateCents,
        })
        .select("id")
        .single();
      if (error) return { ok: false as const, error: `Could not save rate card: ${error.message}` };
      rateCardId = created.id;
    }

    if (input.items.length > 0) {
      const { error } = await db.from("tradie_rate_card_items").insert(
        input.items.map((i) => ({
          org_id: contact.org_id,
          rate_card_id: rateCardId,
          category: i.category,
          flat_price_cents: i.flatPriceCents,
          typical_minutes: i.typicalMinutes,
        })),
      );
      if (error) return { ok: false as const, error: `Could not save rate card items: ${error.message}` };
    }

    return { ok: true as const };
  },

  async getPmPortfolioContext(token: string): Promise<PmPortfolioContext | null> {
    const resolved = await resolveToken(token, "pm_portfolio");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const { data: contact } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", resolved.contact_id)
      .maybeSingle();
    if (!contact) return null;

    const { data: managedProperties } = await db
      .from("properties")
      .select("id")
      .eq("pm_contact_id", resolved.contact_id);
    const ids = (managedProperties ?? []).map((p) => p.id as string);

    const properties = (
      await Promise.all(ids.map((id) => this.getProperty(id)))
    ).filter((p): p is PropertyDetail => p !== null);

    const batches = computeBatchableCompliance(
      properties.map((p) => ({ address: p.address, suburb: p.suburb, compliance: p.compliance })),
    );

    return {
      pmName: contact.full_name as string,
      properties,
      batchableCompliance: batches.map((b) => ({
        requirementKey: b.requirementKey,
        requirementName: b.requirementName,
        suburb: b.suburb,
        propertyAddresses: b.propertyAddresses,
        windowStart: b.windowStart.toISOString(),
        windowEnd: b.windowEnd.toISOString(),
      })),
    };
  },

  async getTradieLeadIntakeInfo(token: string) {
    const resolved = await resolveToken(token, "tradie_lead_intake");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: tradie } = await db
      .from("contacts")
      .select("full_name")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!tradie) return null;
    return { tradieBusinessName: tradie.full_name as string };
  },

  async startTradieLeadConversation(
    token: string,
    existingConversationId?: string,
  ): Promise<TradieLeadConversationContext | null> {
    const resolved = await resolveToken(token, "tradie_lead_intake");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: tradie } = await db
      .from("contacts")
      .select("full_name, org_id")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!tradie) return null;

    if (existingConversationId) {
      const { data: convo } = await db
        .from("sally_conversations")
        .select("id, contact_id, tradie_contact_id")
        .eq("id", existingConversationId)
        .eq("tradie_contact_id", resolved.aggregate_id)
        .maybeSingle();
      if (convo) {
        return {
          conversationId: convo.id,
          contactId: convo.contact_id,
          tradieContactId: resolved.aggregate_id,
          tradieBusinessName: tradie.full_name as string,
        };
      }
      // Not found or mismatched — fall through and start a fresh one rather than erroring.
    }

    const { data: customer, error: custError } = await db
      .from("contacts")
      .insert({ org_id: tradie.org_id, kind: "customer", full_name: "New enquiry" })
      .select("id")
      .single();
    if (custError) throw new Error(`startTradieLeadConversation: ${custError.message}`);

    const { data: convo, error } = await db
      .from("sally_conversations")
      .insert({ org_id: tradie.org_id, contact_id: customer.id, tradie_contact_id: resolved.aggregate_id })
      .select("id")
      .single();
    if (error) throw new Error(`startTradieLeadConversation: ${error.message}`);

    return {
      conversationId: convo.id,
      contactId: customer.id,
      tradieContactId: resolved.aggregate_id,
      tradieBusinessName: tradie.full_name as string,
    };
  },

  async completeTradieLead(conversationId: string, extraction: TradieLeadExtractionInput) {
    const db = serviceClient();
    const { data: convo } = await db
      .from("sally_conversations")
      .select("id, org_id, contact_id, tradie_contact_id, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo || !convo.tradie_contact_id) return { ok: false as const, error: "Conversation not found." };
    if (convo.status === "completed") return { ok: false as const, error: "This lead has already been logged." };

    if (extraction.customerName) {
      await db.from("contacts").update({ full_name: extraction.customerName }).eq("id", convo.contact_id);
    }

    let suggestedQuoteCents: number | null = null;
    let suggestedCallOutFeeCents: number | null = null;
    const { data: rateCard } = await db
      .from("tradie_rate_cards")
      .select("id, call_out_fee_cents, hourly_rate_cents")
      .eq("tradie_contact_id", convo.tradie_contact_id)
      .maybeSingle();
    if (rateCard) {
      suggestedCallOutFeeCents = rateCard.call_out_fee_cents;
      const { data: item } = await db
        .from("tradie_rate_card_items")
        .select("flat_price_cents, typical_minutes")
        .eq("rate_card_id", rateCard.id)
        .eq("category", extraction.category)
        .maybeSingle();
      if (item?.flat_price_cents != null) {
        suggestedQuoteCents = item.flat_price_cents;
      } else if (item?.typical_minutes != null) {
        suggestedQuoteCents = Math.round((rateCard.hourly_rate_cents * item.typical_minutes) / 60);
      }
    }

    const { data: lead, error } = await db
      .from("tradie_leads")
      .insert({
        org_id: convo.org_id,
        tradie_contact_id: convo.tradie_contact_id,
        customer_contact_id: convo.contact_id,
        title: extraction.title,
        description: extraction.description,
        category: extraction.category,
        suggested_quote_cents: suggestedQuoteCents,
        suggested_call_out_fee_cents: suggestedCallOutFeeCents,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: `Could not save lead: ${error.message}` };

    await db
      .from("sally_conversations")
      .update({ status: "completed", ended_at: new Date().toISOString(), tradie_lead_id: lead.id })
      .eq("id", conversationId);

    return { ok: true as const, leadId: lead.id };
  },

  async listTradieLeads(tradiePortalToken: string): Promise<TradieLeadSummary[]> {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return [];
    const db = serviceClient();
    const { data, error } = await db
      .from("tradie_leads")
      .select(
        "id, title, description, category, status, suggested_quote_cents, suggested_call_out_fee_cents, created_at, contacts!tradie_leads_customer_contact_id_fkey(full_name)",
      )
      .eq("tradie_contact_id", resolved.contact_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`listTradieLeads: ${error.message}`);

    return ((data ?? []) as Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      status: string;
      suggested_quote_cents: number | null;
      suggested_call_out_fee_cents: number | null;
      created_at: string;
      contacts: { full_name: string } | { full_name: string }[] | null;
    }>).map((row) => {
      const joined = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return {
        leadId: row.id,
        customerName: joined?.full_name ?? "Unknown",
        title: row.title,
        description: row.description,
        category: row.category as RequestCategory,
        status: row.status,
        suggestedQuoteCents: row.suggested_quote_cents,
        suggestedCallOutFeeCents: row.suggested_call_out_fee_cents,
        createdAt: row.created_at,
      };
    });
  },

  async getTestLinkTargets(): Promise<TestLinkTargets> {
    const db = serviceClient();
    const [{ data: properties }, { data: pms }, { data: tradies }, { data: owners }] = await Promise.all([
      db.from("properties").select("id, address_line1, suburb").order("created_at", { ascending: true }),
      db
        .from("contacts")
        .select("id, full_name")
        .eq("kind", "property_manager")
        .order("created_at", { ascending: true }),
      db.from("contacts").select("id, full_name").eq("kind", "tradie").order("created_at", { ascending: true }),
      db.from("contacts").select("id, full_name").eq("kind", "owner").order("created_at", { ascending: true }),
    ]);
    return {
      properties: ((properties ?? []) as Array<{ id: string; address_line1: string; suburb: string }>).map((p) => ({
        id: p.id,
        address: `${p.address_line1}, ${p.suburb}`,
      })),
      propertyManagers: ((pms ?? []) as Array<{ id: string; full_name: string }>).map((c) => ({
        id: c.id,
        name: c.full_name,
      })),
      tradies: ((tradies ?? []) as Array<{ id: string; full_name: string }>).map((c) => ({
        id: c.id,
        name: c.full_name,
      })),
      owners: ((owners ?? []) as Array<{ id: string; full_name: string }>).map((c) => ({
        id: c.id,
        name: c.full_name,
      })),
    };
  },

  async mintTenantIntakeLink(propertyId: string): Promise<MintLinkResult> {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("id, org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return { ok: false, error: "Property not found." };

    const { data: tenants } = await db
      .from("contacts")
      .select("id")
      .eq("org_id", prop.org_id)
      .eq("kind", "tenant")
      .limit(1);
    let tenantId = tenants?.[0]?.id as string | undefined;
    if (!tenantId) {
      const { data: created, error: createErr } = await db
        .from("contacts")
        .insert({ org_id: prop.org_id, kind: "tenant", full_name: "Test Renter", email: "mac@1pacent.com" })
        .select("id")
        .single();
      if (createErr || !created) return { ok: false, error: "Could not create a test tenant contact." };
      tenantId = created.id as string;
    }

    const issued = issueToken("tenant_intake");
    const { error } = await db.from("access_tokens").insert({
      org_id: prop.org_id,
      token_hash: issued.tokenHash,
      scope: "tenant_intake",
      aggregate_id: prop.id,
      contact_id: tenantId,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/r/${issued.token}` };
  },

  async mintPmPortfolioLink(pmContactId: string): Promise<MintLinkResult> {
    const db = serviceClient();
    const { data: pm } = await db.from("contacts").select("id, org_id").eq("id", pmContactId).maybeSingle();
    if (!pm) return { ok: false, error: "Property manager not found." };

    const issued = issueToken("pm_portfolio");
    const { error } = await db.from("access_tokens").insert({
      org_id: pm.org_id,
      token_hash: issued.tokenHash,
      scope: "pm_portfolio",
      aggregate_id: pm.id,
      contact_id: pm.id,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/pm/${issued.token}` };
  },

  async mintTradiePortalLink(tradieContactId: string): Promise<MintLinkResult> {
    const db = serviceClient();
    const { data: tradie } = await db.from("contacts").select("id, org_id").eq("id", tradieContactId).maybeSingle();
    if (!tradie) return { ok: false, error: "Tradie not found." };

    const issued = issueToken("tradie_portal");
    const { error } = await db.from("access_tokens").insert({
      org_id: tradie.org_id,
      token_hash: issued.tokenHash,
      scope: "tradie_portal",
      aggregate_id: tradie.id,
      contact_id: tradie.id,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/t/${issued.token}` };
  },

  async mintTradieLeadIntakeLink(tradieContactId: string): Promise<MintLinkResult> {
    const db = serviceClient();
    const { data: tradie } = await db.from("contacts").select("id, org_id").eq("id", tradieContactId).maybeSingle();
    if (!tradie) return { ok: false, error: "Tradie not found." };

    const issued = issueToken("tradie_lead_intake");
    const { error } = await db.from("access_tokens").insert({
      org_id: tradie.org_id,
      token_hash: issued.tokenHash,
      scope: "tradie_lead_intake",
      aggregate_id: tradie.id,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/l/${issued.token}` };
  },

  async listTradieJobs(tradiePortalToken: string): Promise<TradieJobSummary[]> {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return [];
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    const { data, error } = await db
      .from("work_orders")
      .select(
        "id, request_id, quote_cents, call_out_fee_cents, maintenance_requests!work_orders_request_id_fkey!inner(id, title, category, status, property_id, properties(address_line1, suburb, state, postcode))",
      )
      .eq("tradie_contact_id", bizId)
      .in("maintenance_requests.status", ["scheduled", "in_progress", "evidence_pending", "verified"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(`listTradieJobs: ${error.message}`);
    return ((data ?? []) as Array<{
      id: string;
      request_id: string;
      quote_cents: number | null;
      call_out_fee_cents: number | null;
      maintenance_requests:
        | {
            title: string;
            category: string;
            status: string;
            properties: { address_line1: string; suburb: string; state: string; postcode: string } | { address_line1: string; suburb: string; state: string; postcode: string }[] | null;
          }
        | Array<{
            title: string;
            category: string;
            status: string;
            properties: { address_line1: string; suburb: string; state: string; postcode: string } | { address_line1: string; suburb: string; state: string; postcode: string }[] | null;
          }>
        | null;
    }>).map((row) => {
      const req = Array.isArray(row.maintenance_requests) ? row.maintenance_requests[0] : row.maintenance_requests;
      const prop = req ? (Array.isArray(req.properties) ? req.properties[0] : req.properties) : null;
      return {
        workOrderId: row.id,
        requestId: row.request_id,
        requestTitle: req?.title ?? "",
        propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
        category: (req?.category ?? "other") as RequestCategory,
        state: (req?.status ?? "scheduled") as RequestState,
        quoteCents: row.quote_cents,
        callOutFeeCents: row.call_out_fee_cents,
      };
    });
  },

  async startJob(tradiePortalToken: string, workOrderId: string) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This portal link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    const result = transition(req.status as RequestState, "start_work", "tradie");
    if (!result.ok) return { ok: false, error: `Cannot start a job from state "${req.status}".` };
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "start_work",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    // The learning loop starts its clock (v8 R3.5): on-site start + the
    // estimate this job carries (the playbook's typical duration).
    const { data: reqPb } = await db
      .from("maintenance_requests")
      .select("playbook_key, category")
      .eq("id", req.id)
      .maybeSingle();
    const playbook =
      (reqPb?.playbook_key ? getPlaybook(reqPb.playbook_key) : null) ??
      (reqPb ? playbookForCategory(reqPb.category as RequestCategory) : null);
    await db
      .from("work_orders")
      .update({
        status: result.state,
        on_site_started_at: new Date().toISOString(),
        estimated_minutes: playbook?.typicalMinutes ?? null,
      })
      .eq("id", wo.id);
    return { ok: true };
  },

  async markJobDone(tradiePortalToken: string, workOrderId: string, note: string) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This portal link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    const result = transition(req.status as RequestState, "submit_evidence", "tradie");
    if (!result.ok) return { ok: false, error: `Cannot mark this done from state "${req.status}".` };
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "submit_evidence",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
      payload: { note },
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    await db.from("work_orders").update({ status: result.state, completion_note: note }).eq("id", wo.id);
    return { ok: true };
  },

  async confirmFixed(tenantIntakeToken: string, requestId: string) {
    const resolved = await resolveToken(tenantIntakeToken, "tenant_intake");
    if (!resolved?.aggregate_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req || req.property_id !== resolved.aggregate_id) return { ok: false, error: "Request not found." };
    const result = transition(req.status as RequestState, "verify", "tenant");
    if (!result.ok) return { ok: false, error: `Cannot confirm from state "${req.status}".` };
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "verify",
      actor_type: "tenant",
      actor_id: `token:${resolved.id}`,
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
    await db.from("work_orders").update({ status: result.state }).eq("request_id", req.id);
    return { ok: true };
  },

  async invoiceJob(tradiePortalToken: string, workOrderId: string, input: InvoiceJobInput) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This portal link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, status, compliance_requirement_key")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };

    const invoiceResult = transition(req.status as RequestState, "invoice", "tradie");
    if (!invoiceResult.ok) return { ok: false, error: `Cannot invoice from state "${req.status}".` };

    // Asset registry (Developer Brief v4 §2): find or create the matching asset —
    // built as a byproduct of invoicing, never extra landlord admin.
    let assetId: string | null = null;
    const { data: existingAsset } = await db
      .from("property_assets")
      .select("id")
      .eq("property_id", req.property_id)
      .eq("category", input.assetCategory)
      .maybeSingle();
    if (existingAsset) {
      assetId = existingAsset.id;
      if (input.assetInstalledAt) {
        await db
          .from("property_assets")
          .update({ label: input.assetLabel, installed_at: input.assetInstalledAt })
          .eq("id", assetId);
      }
    } else {
      const { data: created } = await db
        .from("property_assets")
        .insert({
          org_id: req.org_id,
          property_id: req.property_id,
          category: input.assetCategory,
          label: input.assetLabel,
          installed_at: input.assetInstalledAt,
        })
        .select("id")
        .single();
      assetId = created?.id ?? null;
    }

    const warrantyExpiresAt =
      input.warrantyMonths > 0 ? new Date(Date.now() + input.warrantyMonths * 30 * 86_400_000).toISOString() : null;

    await db
      .from("work_orders")
      .update({
        invoice_cents: input.invoiceCents,
        call_out_fee_cents: input.callOutFeeCents,
        asset_id: assetId,
        warranty_expires_at: warrantyExpiresAt,
        invoiced_at: new Date().toISOString(),
      })
      .eq("id", wo.id);

    // PM compliance batch (v5 §3.1): completing the batch-created job files
    // the certificate — the traffic light goes green from real work.
    if (req.compliance_requirement_key) {
      await db.from("compliance_certificates").insert({
        org_id: req.org_id,
        property_id: req.property_id,
        requirement_key: req.compliance_requirement_key,
        completed_at: new Date().toISOString().slice(0, 10),
        uploaded_by: "system:job-completion",
      });
    }

    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "invoice",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
      payload: { invoiceCents: input.invoiceCents, warrantyMonths: input.warrantyMonths },
    });

    // No payment provider exists yet (documented non-goal) — auto-record and
    // close immediately rather than leaving the job in limbo.
    const paidResult = transition(invoiceResult.state, "record_payment", "system");
    const closedResult = paidResult.ok ? transition(paidResult.state, "close", "system") : null;
    const finalState = closedResult?.ok ? closedResult.state : invoiceResult.state;

    const systemBase = {
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      actor_type: "system",
      actor_id: "auto-payment",
    };
    const trailingEvents: Array<Record<string, unknown>> = [];
    if (paidResult.ok) trailingEvents.push({ ...systemBase, event_type: "record_payment" });
    if (closedResult?.ok) trailingEvents.push({ ...systemBase, event_type: "close" });
    if (trailingEvents.length > 0) {
      await db.from("events").insert(trailingEvents);
    }

    await db.from("maintenance_requests").update({ status: finalState }).eq("id", req.id);
    await db.from("work_orders").update({ status: finalState }).eq("id", wo.id);

    return { ok: true };
  },

  async getRequestStatusForContact(tenantIntakeToken: string): Promise<TenantRequestStatus[]> {
    const resolved = await resolveToken(tenantIntakeToken, "tenant_intake");
    if (!resolved?.aggregate_id) return [];
    const db = serviceClient();
    const { data: reqs } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, title, description, category, status, estimate_cents, reported_at, warranty_claim_of_work_order_id")
      .eq("property_id", resolved.aggregate_id)
      .order("reported_at", { ascending: false });
    const rows = (reqs ?? []) as RequestRow[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { data: ev } = await db
      .from("events")
      .select("aggregate_id, event_type, actor_type, actor_id, payload, created_at")
      .eq("aggregate_type", "maintenance_request")
      .in("aggregate_id", ids)
      .order("id", { ascending: true });
    const events = (ev ?? []) as EventRow[];
    return rows.map((r) => toRequestView(r, events));
  },

  async updatePropertyOwnership(propertyId: string, input: { occupancyStatus: OccupancyStatus; ownerContactId: string | null }) {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("id, org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return { ok: false, error: "Property not found." };
    const { error } = await db
      .from("properties")
      .update({ occupancy_status: input.occupancyStatus, owner_contact_id: input.ownerContactId })
      .eq("id", propertyId);
    if (error) return { ok: false, error: error.message };
    await db.from("events").insert({
      org_id: prop.org_id,
      aggregate_type: "property",
      aggregate_id: propertyId,
      event_type: "ownership_recorded",
      actor_type: "landlord",
      actor_id: "dashboard",
      payload: { occupancyStatus: input.occupancyStatus, ownerContactId: input.ownerContactId },
    });
    return { ok: true };
  },

  async getApprovalPolicy(propertyId: string): Promise<ApprovalPolicyRuleView[]> {
    const db = serviceClient();
    const { data, error } = await db
      .from("approval_policy_rules")
      .select("id, priority, max_total_cents, min_trust_score, exclude_categories, enabled")
      .eq("property_id", propertyId)
      .order("priority", { ascending: true });
    if (error) throw new Error(`getApprovalPolicy: ${error.message}`);
    return ((data ?? []) as Array<{
      id: string;
      priority: number;
      max_total_cents: number | null;
      min_trust_score: number | null;
      exclude_categories: string[];
      enabled: boolean;
    }>).map((r) => ({
      id: r.id,
      priority: r.priority,
      maxTotalCents: r.max_total_cents,
      minTrustScore: r.min_trust_score,
      excludeCategories: (r.exclude_categories ?? []) as RequestCategory[],
      enabled: r.enabled,
    }));
  },

  async saveApprovalPolicy(propertyId: string, rules: ApprovalPolicyRuleInput[]) {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("id, org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return { ok: false, error: "Property not found." };
    const { error: delError } = await db.from("approval_policy_rules").delete().eq("property_id", propertyId);
    if (delError) return { ok: false, error: delError.message };
    if (rules.length > 0) {
      const { error: insError } = await db.from("approval_policy_rules").insert(
        rules.map((r) => ({
          org_id: prop.org_id,
          property_id: propertyId,
          priority: r.priority,
          max_total_cents: r.maxTotalCents,
          min_trust_score: r.minTrustScore,
          exclude_categories: r.excludeCategories,
          enabled: r.enabled,
        })),
      );
      if (insError) return { ok: false, error: insError.message };
    }
    return { ok: true };
  },

  // ——— Talk / See / Do (Developer Brief v6) ———

  async getCanvasCards(token: string): Promise<CanvasCard[]> {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal", "pm_portfolio", "tradie_portal"]);
    if (!row) return [];
    const db = serviceClient();

    if (row.scope === "tenant_intake") {
      const [reqs, compliance] = await Promise.all([
        supabaseData.getRequestStatusForContact(token),
        supabaseData.getComplianceStatus(token),
      ]);
      return buildTenantCanvas({
        token,
        requests: reqs,
        slots: await slotInfosForRequests(db, reqs.map((r) => r.id)),
        compliance,
      });
    }

    if (row.scope === "owner_portal") {
      const ctx = await supabaseData.getOwnerPortalContext(token);
      if (!ctx) return [];
      const allReqs = ctx.properties.flatMap((p) => p.requests);
      const nowIso = new Date().toISOString();

      const quotePicks: QuotePickInfo[] = [];
      for (const r of allReqs.filter((x) => x.state === "quoting")) {
        const requestQuotes = await supabaseData.listQuotesForRequest(r.id);
        if (requestQuotes.some((q) => q.status === "invited")) continue;
        const submitted = requestQuotes.filter((q) => q.status === "submitted");
        if (submitted.length === 0) continue;
        const trust = await supabaseData.getTradieTrustSummaries([
          ...new Set(submitted.map((q) => q.tradieContactId)),
        ]);
        const rankable = submitted
          .filter((q) => q.quoteCents !== null && q.callOutFeeCents !== null)
          .map((q) => ({
            quoteId: q.quoteId,
            totalCents: q.quoteCents! + q.callOutFeeCents!,
            trustScore: scoreTrust(trust[q.tradieContactId] ?? { completedJobs: 0, avgAbsVariancePct: null }),
            availabilityScore: scoreAvailability({
              tradieRespondedWithinMinutes: q.respondedWithinMinutes,
              matchesTenantPreferredWindow: false,
              currentOpenJobCount: 0,
            }),
          }));
        if (rankable.length === 0) continue;
        const ranked: RankedQuoteOption[] = rankQuotes(rankable).map((rq, i) => {
          const q = submitted.find((x) => x.quoteId === rq.quoteId)!;
          return {
            quoteId: rq.quoteId,
            tradieName: q.tradieName,
            totalCents: rq.totalCents,
            trustScore: rq.trustScore,
            recommended: i === 0,
          };
        });
        quotePicks.push({
          requestId: r.id,
          title: r.title,
          estimateCents: r.estimateCents,
          quotes: ranked,
          at: r.events[r.events.length - 1]?.at ?? nowIso,
        });
      }

      const warrantyCatches: WarrantyCatchInfo[] = [];
      for (const r of allReqs.filter((x) => x.isWarrantyClaim)) {
        const { data: claimRow } = await db
          .from("maintenance_requests")
          .select("warranty_claim_of_work_order_id")
          .eq("id", r.id)
          .maybeSingle();
        let tradieName = "the original tradie";
        if (claimRow?.warranty_claim_of_work_order_id) {
          const { data: originalWo } = await db
            .from("work_orders")
            .select("tradie_contact_id, contacts(full_name)")
            .eq("id", claimRow.warranty_claim_of_work_order_id)
            .maybeSingle();
          const contact = normalizeContact(
            (originalWo as { contacts: ContactJoin | ContactJoin[] | null } | null)?.contacts ?? null,
          );
          if (contact?.full_name) tradieName = contact.full_name;
        }
        warrantyCatches.push({
          requestId: r.id,
          title: r.title,
          tradieName,
          savedApproxCents: (await categoryMedians(db))[r.category] ?? null,
          at: r.events[r.events.length - 1]?.at ?? nowIso,
        });
      }

      const [horizon, spending, reports] = await Promise.all([
        supabaseData.getAssetHorizon(token),
        supabaseData.getSpendingSummary(token, 12),
        db
          .from("generated_reports")
          .select("id, kind, created_at")
          .eq("audience_contact_id", ctx.ownerContactId)
          .order("created_at", { ascending: true }),
      ]);
      const reportListings: ReportListing[] = ((reports.data ?? []) as Array<{
        id: string;
        kind: ReportKind;
        created_at: string;
      }>).map((r) => ({ id: r.id, kind: r.kind, createdAt: r.created_at }));

      return buildOwnerCanvas({
        token,
        ctx,
        quotePicks,
        slots: await slotInfosForRequests(db, allReqs.map((r) => r.id)),
        warrantyCatches,
        horizon,
        spending,
        reports: reportListings,
      });
    }

    if (row.scope === "pm_portfolio") {
      const [ctx, obligations] = await Promise.all([
        supabaseData.getPmPortfolioContext(token),
        supabaseData.getObligationsCalendar(token, 120),
      ]);
      if (!ctx) return [];
      return buildPmCanvas({
        properties: ctx.properties.map((p) => ({
          id: p.id,
          address: p.address,
          suburb: p.suburb,
          overall: p.compliance.overall,
          requests: p.requests,
        })),
        obligations,
      });
    }

    // tradie_portal
    const [jobs, accuracy, autoQuote] = await Promise.all([
      supabaseData.listTradieJobs(token),
      supabaseData.getTradieAccuracy(token),
      supabaseData.getAutoQuoteSettings(token),
    ]);
    const jobsWith = await Promise.all(
      jobs.map(async (j) => {
        const { data: wo } = await db
          .from("work_orders")
          .select("scheduled_start_at, scheduled_end_at, maintenance_requests!work_orders_request_id_fkey(property_id)")
          .eq("id", j.workOrderId)
          .maybeSingle();
        const woRow = wo as {
          scheduled_start_at: string | null;
          scheduled_end_at: string | null;
          maintenance_requests: { property_id: string } | { property_id: string }[] | null;
        } | null;
        const reqJoin = Array.isArray(woRow?.maintenance_requests)
          ? woRow?.maintenance_requests[0]
          : woRow?.maintenance_requests;
        let briefing: string[] = [];
        if (reqJoin?.property_id) {
          const { data: assets } = await db
            .from("property_assets")
            .select("label, installed_at")
            .eq("property_id", reqJoin.property_id);
          briefing = ((assets ?? []) as Array<{ label: string; installed_at: string | null }>).map(
            (a) => `${a.label}${a.installed_at ? ` (installed ${new Date(a.installed_at).getFullYear()})` : ""}`,
          );
        }
        return {
          ...j,
          scheduledLabel: woRow?.scheduled_start_at
            ? formatSlot({
                startAt: new Date(woRow.scheduled_start_at),
                endAt: new Date(woRow.scheduled_end_at ?? woRow.scheduled_start_at),
              })
            : null,
          briefing,
        };
      }),
    );
    return buildTradieCanvas({ token, jobs: jobsWith, accuracy, autoQuote });
  },

  async getSpendingSummary(scopeToken: string, periodMonths: number): Promise<SpendingSummaryView | null> {
    const db = serviceClient();
    const propertyIds = await scopedPropertyIds(db, scopeToken);
    if (propertyIds === null) return null;
    return spendingForProperties(db, propertyIds, periodMonths);
  },

  async getAssetHorizon(scopeToken: string): Promise<AssetHorizonView[]> {
    const db = serviceClient();
    const propertyIds = await scopedPropertyIds(db, scopeToken);
    if (propertyIds === null || propertyIds.length === 0) return [];
    const medians = await categoryMedians(db);
    const today = new Date();
    const { data: assets } = await db
      .from("property_assets")
      .select("label, category, installed_at, property_id, properties(address_line1, suburb, state, postcode)")
      .in("property_id", propertyIds)
      .not("installed_at", "is", null);
    return ((assets ?? []) as Array<{
      label: string;
      category: string;
      installed_at: string;
      properties:
        | { address_line1: string; suburb: string; state: string; postcode: string }
        | { address_line1: string; suburb: string; state: string; postcode: string }[]
        | null;
    }>)
      .map((a) => {
        const prop = Array.isArray(a.properties) ? a.properties[0] : a.properties;
        const horizon = assessAssetHorizon({
          category: a.category as RequestCategory,
          installedAt: new Date(a.installed_at),
          today,
        });
        return {
          propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
          assetLabel: a.label,
          category: a.category as RequestCategory,
          ageYears: horizon.ageYears,
          effectiveLifeYears: horizon.effectiveLifeYears,
          remainingLifeYears: horizon.remainingLifeYears,
          status: horizon.status,
          plannedReplacementCents: medians[a.category as RequestCategory] ?? null,
          disclaimer: horizon.disclaimer,
        };
      })
      .sort((a, b) => a.remainingLifeYears - b.remainingLifeYears);
  },

  async getObligationsCalendar(scopeToken: string, horizonDays: number): Promise<ObligationsCalendarView | null> {
    const db = serviceClient();
    const propertyIds = await scopedPropertyIds(db, scopeToken);
    if (propertyIds === null) return null;
    return obligationsForProperties(propertyIds, horizonDays);
  },

  async generateReport(scopeToken: string, kind: ReportKind, subjectId?: string) {
    const db = serviceClient();
    const row = await resolveTokenAny(scopeToken, ["owner_portal", "pm_portfolio"]);
    const propertyIds = await scopedPropertyIds(db, scopeToken);
    if (!row || propertyIds === null) return { ok: false, error: "This link isn't active." };
    const subject = subjectId && propertyIds.includes(subjectId) ? subjectId : propertyIds[0];
    if (!subject) return { ok: false, error: "No property in scope for this report." };

    let payload: Record<string, unknown>;
    if (kind === "property_data_pack") {
      payload = await buildDataPackPayload(db, subject, propertyIds);
    } else if (kind === "spending_summary") {
      payload = { ...(await spendingForProperties(db, propertyIds, 12)) };
    } else if (kind === "obligations_calendar") {
      payload = { ...(await obligationsForProperties(propertyIds, 120)) };
    } else {
      return { ok: false, error: `Report kind "${kind}" isn't available yet.` };
    }

    const { data: prop } = await db.from("properties").select("org_id").eq("id", subject).maybeSingle();
    if (!prop) return { ok: false, error: "Property not found." };
    const { data: created, error } = await db
      .from("generated_reports")
      .insert({
        org_id: prop.org_id,
        kind,
        subject_id: subject,
        audience_contact_id: row.contact_id,
        payload,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Could not save the report." };
    return { ok: true, reportId: created.id as string };
  },

  async getReport(scopeToken: string, reportId: string): Promise<GeneratedReportView | null> {
    const row = await resolveTokenAny(scopeToken, ["owner_portal", "pm_portfolio", "tradie_portal"]);
    if (!row) return null;
    const db = serviceClient();
    const { data } = await db
      .from("generated_reports")
      .select("id, kind, created_at, payload")
      .eq("id", reportId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      kind: data.kind as ReportKind,
      createdAt: data.created_at as string,
      payload: (data.payload ?? {}) as Record<string, unknown>,
    };
  },

  async getComplianceStatus(scopeToken: string): Promise<ComplianceStatusView[]> {
    const db = serviceClient();
    const row = await resolveTokenAny(scopeToken, ["tenant_intake", "owner_portal", "pm_portfolio"]);
    if (!row) return [];
    const propertyIds =
      row.scope === "tenant_intake" ? (row.aggregate_id ? [row.aggregate_id] : []) : await scopedPropertyIds(db, scopeToken);
    if (!propertyIds) return [];
    const details = (await Promise.all(propertyIds.map((id) => supabaseData.getProperty(id)))).filter(
      (p): p is PropertyDetail => p !== null,
    );
    return details.map((p) => ({
      propertyAddress: `${p.address}, ${p.suburb}`,
      overall: p.compliance.overall,
      requirements: p.compliance.requirements.map((r) => ({
        name: r.requirement.name,
        status: r.status,
        lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
        dueAt: r.dueAt?.toISOString() ?? null,
      })),
    }));
  },

  async getOwnerPortalContext(token: string): Promise<OwnerPortalContext | null> {
    const resolved = await resolveToken(token, "owner_portal");
    if (!resolved?.aggregate_id) return null;
    const db = serviceClient();
    const { data: owner } = await db
      .from("contacts")
      .select("id, full_name")
      .eq("id", resolved.aggregate_id)
      .maybeSingle();
    if (!owner) return null;
    const { data: owned } = await db.from("properties").select("id").eq("owner_contact_id", owner.id);
    const details = (
      await Promise.all(((owned ?? []) as Array<{ id: string }>).map((p) => supabaseData.getProperty(p.id)))
    ).filter((p): p is PropertyDetail => p !== null);
    return { ownerContactId: owner.id as string, ownerName: owner.full_name as string, properties: details };
  },

  async mintOwnerPortalLink(ownerContactId: string): Promise<MintLinkResult> {
    const db = serviceClient();
    const { data: owner } = await db
      .from("contacts")
      .select("id, org_id")
      .eq("id", ownerContactId)
      .eq("kind", "owner")
      .maybeSingle();
    if (!owner) return { ok: false, error: "Owner not found." };

    const issued = issueToken("owner_portal");
    const { error } = await db.from("access_tokens").insert({
      org_id: owner.org_id,
      token_hash: issued.tokenHash,
      scope: "owner_portal",
      aggregate_id: owner.id,
      contact_id: owner.id,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/o/${issued.token}` };
  },

  async confirmSlot(token: string, workOrderId: string, slotIndex: number) {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, proposed_slots")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo?.proposed_slots) return { ok: false, error: "No proposed slots for this job." };
    const slots = wo.proposed_slots as Array<{ startAt: string; endAt: string }>;
    const slot = slots[slotIndex];
    if (!slot) return { ok: false, error: "That slot is no longer available." };

    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, property_id")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    // Scope check in the data layer: the job must belong to a property this
    // token can see.
    if (row.scope === "tenant_intake") {
      if (req.property_id !== row.aggregate_id) return { ok: false, error: "Job not found." };
    } else {
      const { data: prop } = await db
        .from("properties")
        .select("owner_contact_id")
        .eq("id", req.property_id)
        .maybeSingle();
      if (prop?.owner_contact_id !== row.aggregate_id) return { ok: false, error: "Job not found." };
    }

    await db
      .from("work_orders")
      .update({ scheduled_start_at: slot.startAt, scheduled_end_at: slot.endAt, proposed_slots: null })
      .eq("id", wo.id);
    // Human actor on the work-order aggregate — the audit point. (The request
    // is already "scheduled"; no state transition fires here.)
    await db.from("events").insert({
      org_id: wo.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: "slot_confirmed",
      actor_type: row.scope === "tenant_intake" ? "tenant" : "landlord",
      actor_id: `token:${row.id}`,
      payload: { startAt: slot.startAt, endAt: slot.endAt },
    });
    return { ok: true };
  },

  async dispatchComplianceBatch(pmPortfolioToken: string, input: { requirementKey: string; suburb: string }) {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const ctx = await supabaseData.getPmPortfolioContext(pmPortfolioToken);
    if (!ctx) return { ok: false, error: "Portfolio not found." };

    const targets = ctx.properties.filter(
      (p) =>
        p.suburb === input.suburb &&
        p.compliance.requirements.some(
          (r) => r.requirement.key === input.requirementKey && r.status !== "green" && r.dueAt,
        ),
    );
    if (targets.length === 0) return { ok: false, error: "No batchable properties for that requirement." };
    const requirementName =
      targets[0]!.compliance.requirements.find((r) => r.requirement.key === input.requirementKey)?.requirement
        .name ?? input.requirementKey;
    const category = complianceCategoryFor(input.requirementKey);

    const db = serviceClient();
    let dispatched = 0;
    for (const property of targets) {
      // Skip if an open batch request already exists for this requirement.
      const { data: existing } = await db
        .from("maintenance_requests")
        .select("id, status")
        .eq("property_id", property.id)
        .eq("compliance_requirement_key", input.requirementKey)
        .not("status", "in", "(closed,cancelled,declined)")
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { data: propRow } = await db.from("properties").select("org_id").eq("id", property.id).maybeSingle();
      if (!propRow) continue;
      const state = projectState([
        { eventType: "triage", actorType: "system" },
        { eventType: "request_approval", actorType: "system" },
        { eventType: "approve", actorType: "agency_user" },
      ]);
      const { data: created, error: createErr } = await db
        .from("maintenance_requests")
        .insert({
          org_id: propRow.org_id,
          property_id: property.id,
          title: `${requirementName} (compliance batch)`,
          description: `Scheduled ${requirementName.toLowerCase()} — batched across ${targets.length} ${input.suburb} properties for a negotiated rate.`,
          category,
          is_urgent: false,
          status: state,
          compliance_requirement_key: input.requirementKey,
        })
        .select("id")
        .single();
      if (createErr || !created) continue;

      const base = {
        org_id: propRow.org_id,
        aggregate_type: "maintenance_request",
        aggregate_id: created.id,
      };
      await db.from("events").insert([
        { ...base, event_type: "triage", actor_type: "system", actor_id: "compliance-batch" },
        { ...base, event_type: "request_approval", actor_type: "system", actor_id: "compliance-batch" },
        // The PM's tap is the human approval — attributed to their contact id.
        {
          ...base,
          event_type: "approve",
          actor_type: "agency_user",
          actor_id: resolved.contact_id,
          payload: { note: "PM batch dispatch" },
        },
      ]);
      await supabaseData.dispatchQuotesForRequest(created.id as string);
      dispatched += 1;
    }
    return { ok: true, dispatched };
  },

  async getAutoQuoteSettings(tradiePortalToken: string): Promise<AutoQuoteSettingsView | null> {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const { data: card } = await db
      .from("tradie_rate_cards")
      .select("auto_quote_enabled, auto_quote_max_total_cents")
      .eq("tradie_contact_id", resolved.contact_id)
      .maybeSingle();
    if (!card) return { enabled: false, maxTotalCents: null };
    return {
      enabled: Boolean(card.auto_quote_enabled),
      maxTotalCents: card.auto_quote_max_total_cents === null ? null : Number(card.auto_quote_max_total_cents),
    };
  },

  async setAutoQuote(tradiePortalToken: string, input: { enabled: boolean; maxTotalCents: number | null }) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: card } = await db
      .from("tradie_rate_cards")
      .select("id")
      .eq("tradie_contact_id", resolved.contact_id)
      .maybeSingle();
    if (!card) return { ok: false, error: "Set up your rate card first — auto-quote submits from it." };
    const { error } = await db
      .from("tradie_rate_cards")
      .update({ auto_quote_enabled: input.enabled, auto_quote_max_total_cents: input.maxTotalCents })
      .eq("id", card.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async getTradieAccuracy(tradiePortalToken: string): Promise<TradieAccuracyView | null> {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const { data: completed } = await db
      .from("work_orders")
      .select("id, quote_cents, invoice_cents, maintenance_requests!work_orders_request_id_fkey(title, playbook_key, category)")
      .eq("tradie_contact_id", resolved.contact_id)
      .not("invoice_cents", "is", null)
      .not("quote_cents", "is", null)
      .gt("quote_cents", 0)
      .order("created_at", { ascending: true });
    const allRows = (completed ?? []) as Array<{
      id: string;
      quote_cents: number;
      invoice_cents: number;
      maintenance_requests:
        | { title: string; playbook_key: string | null; category: string }
        | { title: string; playbook_key: string | null; category: string }[]
        | null;
    }>;
    // FAIRNESS (core rule): network-priced (fixed-band) jobs never count
    // toward the tradie's quote accuracy — the tradie didn't set that price.
    const pricingOf = (r: (typeof allRows)[number]) => {
      const req = Array.isArray(r.maintenance_requests) ? r.maintenance_requests[0] : r.maintenance_requests;
      const pb = req?.playbook_key ? getPlaybook(req.playbook_key) : null;
      return pb?.pricing.model ?? "quote_race"; // no playbook = the tradie priced it
    };
    const rows = allRows.filter((r) => countsTowardQuoteAccuracy(pricingOf(r)));
    const recentJobs = rows.slice(-5).map((w) => {
      const req = Array.isArray(w.maintenance_requests) ? w.maintenance_requests[0] : w.maintenance_requests;
      return {
        requestTitle: req?.title ?? "Job",
        quoteCents: Number(w.quote_cents),
        invoiceCents: Number(w.invoice_cents),
        variancePct: Math.round(((Number(w.invoice_cents) - Number(w.quote_cents)) / Number(w.quote_cents)) * 100),
      };
    });
    const variances = rows.map((w) => Math.abs(Number(w.invoice_cents) - Number(w.quote_cents)) / Number(w.quote_cents));
    const avgAbsVariancePct =
      variances.length > 0 ? (variances.reduce((a, b) => a + b, 0) / variances.length) * 100 : null;
    // The learning loop's other half: estimated-vs-actual on-site time.
    // FAIRNESS: an approved/auto-applied scope change voids the estimate —
    // the job the tradie ran is not the job that was estimated.
    const { data: timedRows } = await db
      .from("work_orders")
      .select("id, estimated_minutes, actual_minutes")
      .eq("tradie_contact_id", resolved.contact_id)
      .not("actual_minutes", "is", null)
      .not("estimated_minutes", "is", null)
      .gt("estimated_minutes", 0);
    const timedAll = (timedRows ?? []) as Array<{ id: string; estimated_minutes: number; actual_minutes: number }>;
    const { data: variedRows } = timedAll.length
      ? await db
          .from("variances")
          .select("work_order_id")
          .in("work_order_id", timedAll.map((w) => w.id))
          .in("status", ["approved", "auto_applied"])
      : { data: [] };
    const scopeChanged = new Set(((variedRows ?? []) as Array<{ work_order_id: string }>).map((v) => v.work_order_id));
    const timeVariances = timedAll
      .filter((w) => countsTowardTimeAccuracy(scopeChanged.has(w.id) ? "approved" : "none"))
      .map((w) => computeTimeAccuracy(Number(w.estimated_minutes), Number(w.actual_minutes)).absVariancePct);
    const avgAbsTimeVariancePct =
      timeVariances.length > 0 ? timeVariances.reduce((a, b) => a + b, 0) / timeVariances.length : null;
    return {
      completedJobs: allRows.length,
      avgAbsVariancePct,
      avgAbsTimeVariancePct,
      trustScore: scoreTrust({
        completedJobs: rows.length,
        avgAbsVariancePct: blendedAccuracyPct(avgAbsVariancePct, avgAbsTimeVariancePct),
      }),
      recentJobs,
    };
  },

  // ——— v8 R1: The Uber Slice ———

  async previewBooking(token, input): Promise<BookingPreview | null> {
    const db = serviceClient();
    const propertyId = await bookablePropertyId(db, token, input.propertyId);
    if (!propertyId) return null;
    const { data: prop } = await db
      .from("properties")
      .select("id, address_line1, suburb, state, postcode")
      .eq("id", propertyId)
      .maybeSingle();
    if (!prop) return null;
    const playbook = (input.playbookKey ? getPlaybook(input.playbookKey) : null) ?? playbookForCategory(input.category);

    let bandLow: number | null = null;
    let bandHigh: number | null = null;
    let bookAmount: number | null = null;
    let evidenceCount = 0;
    let confidence: "low" | "medium" | "high" = "low";
    if (playbook.pricing.model === "fixed_band") {
      const comparables = await supabaseData
        .getComparableJobs(propertyId, playbook.category)
        .catch((e) => {
          console.warn("[pulse] comparables failed, using fallback band:", e);
          return [] as Array<{ finalInvoiceCents: number }>;
        });
      const band = estimatePriceBand(playbook.category, comparables);
      bandLow = band.lowCents;
      bandHigh = band.highCents;
      bookAmount = bookableAmountFromBand(band.lowCents, band.highCents);
      evidenceCount = band.evidenceCount;
      confidence = band.confidence;
    }

    const onlineIds = await onlineTradieIds(db);
    const urgent = isUrgentCategory(playbook.category);
    let windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [];
    if (onlineIds.length > 0) {
      const { data: w } = await db
        .from("tradie_availability_windows")
        .select("day_of_week, start_time, end_time")
        .in("tradie_contact_id", onlineIds);
      windows = ((w ?? []) as Array<{ day_of_week: number; start_time: string; end_time: string }>).map((x) => ({
        dayOfWeek: x.day_of_week,
        startTime: x.start_time,
        endTime: x.end_time,
      }));
    }
    const slots = proposeSlots(windows, { from: earliestSlotStart(new Date(), urgent), count: 3 });

    return {
      playbookKey: playbook.key,
      playbookTitle: playbook.title,
      category: playbook.category,
      pricing: playbook.pricing.model,
      bandLowCents: bandLow,
      bandHighCents: bandHigh,
      bookAmountCents: bookAmount,
      evidenceGates: [...playbook.evidenceGates],
      warrantyMonths: playbook.warrantyDefaultMonths,
      urgent,
      evidenceCount,
      confidence,
      slots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString(), label: formatSlot(s) })),
      tradiesOnline: onlineIds.length,
      propertyId,
      propertyAddress: `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}`,
    };
  },

  async bookJob(token, input): Promise<BookJobResult> {
    const db = serviceClient();
    const propertyId = await bookablePropertyId(db, token, input.propertyId);
    if (!propertyId) return { ok: false, error: "This link isn't active." };
    const { data: prop } = await db.from("properties").select("id, org_id, pm_contact_id").eq("id", propertyId).maybeSingle();
    if (!prop) return { ok: false, error: "Property not found." };
    const playbook = getPlaybook(input.playbookKey) ?? playbookForCategory(input.category);
    const urgent = isUrgentCategory(playbook.category);

    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: "auto_approve", actorType: "system" },
    ]);
    const { data: req, error: reqError } = await db
      .from("maintenance_requests")
      .insert({
        org_id: prop.org_id,
        property_id: propertyId,
        title: input.title,
        description: input.description,
        category: playbook.category,
        is_urgent: urgent,
        status: state,
        playbook_key: playbook.key,
        booked_start_at: input.slot?.startAt ?? null,
        booked_end_at: input.slot?.endAt ?? null,
      })
      .select("id")
      .single();
    if (reqError || !req) return { ok: false, error: reqError?.message ?? "Could not save the booking." };

    const base = { org_id: prop.org_id, aggregate_type: "maintenance_request", aggregate_id: req.id };
    await db.from("events").insert([
      {
        ...base,
        event_type: "triage",
        actor_type: "system",
        actor_id: "sally:triage",
        ai_meta: input.aiMeta ?? null,
        payload: { playbook: playbook.key },
      },
      {
        ...base,
        event_type: "auto_approve",
        actor_type: "system",
        actor_id: "playbook:booking",
        payload: {
          note: urgent
            ? "Urgent bypass (VIC urgent repairs list)"
            : `Fixed-process playbook "${playbook.key}" — payer authorized at booking`,
        },
      },
    ]);

    if (playbook.pricing.model !== "fixed_band") {
      const dispatch = await supabaseData.dispatchQuotesForRequest(req.id as string);
      return dispatch.ok
        ? { ok: true, requestId: req.id as string, offered: dispatch.invites.length, amountAuthorizedCents: null }
        : { ok: false, error: dispatch.error };
    }

    // Fixed band: authorize (simulated PSP hold — no custody) and offer.
    const comparables = await supabaseData
      .getComparableJobs(propertyId, playbook.category)
      .catch((e) => {
        console.warn("[pulse] comparables failed, using fallback band:", e);
        return [] as Array<{ finalInvoiceCents: number }>;
      });
    const band = estimatePriceBand(playbook.category, comparables);
    const amount = bookableAmountFromBand(band.lowCents, band.highCents);
    const split = splitPayment(amount);
    // The hold goes through the PSP seam — simulated by default, Stripe
    // (manual capture) when STRIPE_SECRET_KEY is set. No custody either way.
    const psp = resolvePsp();
    const auth = await psp.authorize({ amountCents: amount, requestId: req.id as string, description: `1Pacent ${playbook.title}` });
    if (!auth.ok) console.warn("[penny] authorization pending at PSP:", auth.error);
    await db.from("payments").insert({
      org_id: prop.org_id,
      request_id: req.id,
      status: "authorized",
      amount_cents: amount,
      platform_fee_cents: split.platformFeeCents,
      kind: "primary",
      psp: psp.name,
      psp_ref: auth.pspRef ?? null,
    });

    await db.from("events").insert({ ...base, event_type: "request_quotes", actor_type: "system", actor_id: "george:offer" });
    await db.from("maintenance_requests").update({ status: "quoting" }).eq("id", req.id);

    // House dispatch (v8 R7): small jobs at a PM-managed property go to the
    // PM's chosen defaults first — their own handyman, the onsite man, or a
    // standing agreement — instead of the open network.
    let onlineIds = (await onlineTradieIds(db)).slice(0, 3);
    let dispatchMode: "network" | "house" = "network";
    if (prop.pm_contact_id) {
      const [{ data: house }, { data: prefs }] = await Promise.all([
        db.from("pm_preferred_tradies").select("tradie_contact_id, priority").eq("pm_contact_id", prop.pm_contact_id).order("priority"),
        db.from("pm_dispatch_prefs").select("house_max_job_cents").eq("pm_contact_id", prop.pm_contact_id).maybeSingle(),
      ]);
      const houseIds = ((house ?? []) as Array<{ tradie_contact_id: string }>).map((h) => h.tradie_contact_id);
      const ceiling = prefs ? Number(prefs.house_max_job_cents) : 30_000;
      if (houseIds.length > 0 && amount <= ceiling) {
        onlineIds = houseIds.slice(0, 3);
        dispatchMode = "house";
      }
    }
    if (dispatchMode === "house") {
      await db.from("events").insert({
        ...base,
        event_type: "house_dispatch",
        actor_type: "system",
        actor_id: "george:house",
        payload: { note: "Small job — dispatched to the manager's house tradies first." },
      });
    }
    for (const tradieId of onlineIds) {
      await db.from("quotes").insert({
        org_id: prop.org_id,
        request_id: req.id,
        tradie_contact_id: tradieId,
        status: "invited",
        quote_cents: amount,
        call_out_fee_cents: 0,
        note: "Fixed-price offer — first accept wins.",
      });
    }
    return { ok: true, requestId: req.id as string, offered: onlineIds.length, amountAuthorizedCents: amount };
  },

  async getOpenOffers(tradiePortalToken): Promise<JobOfferView[]> {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return [];
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    const { data } = await db
      .from("quotes")
      .select(
        "id, quote_cents, maintenance_requests!quotes_request_id_fkey!inner(id, title, category, status, playbook_key, booked_start_at, booked_end_at, property_id, properties(address_line1, suburb, state, postcode))",
      )
      .eq("tradie_contact_id", bizId)
      .eq("status", "invited")
      .eq("maintenance_requests.status", "quoting");
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      quote_cents: number | null;
      maintenance_requests: {
        id: string;
        title: string;
        category: string;
        playbook_key: string | null;
        booked_start_at: string | null;
        booked_end_at: string | null;
        property_id: string;
        properties:
          | { address_line1: string; suburb: string; state: string; postcode: string }
          | { address_line1: string; suburb: string; state: string; postcode: string }[]
          | null;
      };
    }>;
    const offers: JobOfferView[] = [];
    for (const row of rows) {
      const req = row.maintenance_requests;
      const playbook = req.playbook_key ? getPlaybook(req.playbook_key) : null;
      if (!playbook || playbook.pricing.model !== "fixed_band") continue;
      const prop = Array.isArray(req.properties) ? req.properties[0] : req.properties;
      const { data: assets } = await db
        .from("property_assets")
        .select("label, installed_at")
        .eq("property_id", req.property_id);
      offers.push({
        quoteId: row.id,
        requestId: req.id,
        title: req.title,
        playbookTitle: playbook.title,
        propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
        payoutCents: row.quote_cents !== null ? splitPayment(Number(row.quote_cents)).tradiePayoutCents : null,
        slot: req.booked_start_at
          ? {
              startAt: req.booked_start_at,
              endAt: req.booked_end_at ?? req.booked_start_at,
              label: formatSlot({
                startAt: new Date(req.booked_start_at),
                endAt: new Date(req.booked_end_at ?? req.booked_start_at),
              }),
            }
          : null,
        briefing: ((assets ?? []) as Array<{ label: string; installed_at: string | null }>).map(
          (a) => `${a.label}${a.installed_at ? ` (installed ${new Date(a.installed_at).getFullYear()})` : ""}`,
        ),
        urgent: isUrgentCategory(req.category as RequestCategory),
      });
    }
    return offers;
  },

  async acceptJobOffer(tradiePortalToken, quoteId) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    const { data: quote } = await db
      .from("quotes")
      .select("id, org_id, request_id, status, tradie_contact_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote || quote.tradie_contact_id !== bizId || quote.status !== "invited") {
      return { ok: false, error: "That job's gone — another tradie got there first." };
    }
    const { data: reqRow } = await db
      .from("maintenance_requests")
      .select("id, org_id, status")
      .eq("id", quote.request_id)
      .maybeSingle();
    if (!reqRow || (reqRow.status as RequestState) !== "quoting") {
      return { ok: false, error: "That job's gone — another tradie got there first." };
    }
    // The tradie's tap — the human event on this side of the market.
    const { data: claimed } = await db
      .from("quotes")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", quote.id)
      .eq("status", "invited")
      .select("id");
    if (!claimed || claimed.length === 0) {
      return { ok: false, error: "That job's gone — another tradie got there first." };
    }
    await db.from("events").insert({
      org_id: quote.org_id,
      aggregate_type: "quote",
      aggregate_id: quote.id,
      event_type: "offer_accepted",
      actor_type: "tradie",
      actor_id: `contact:${resolved.contact_id}`,
    });
    // Payer pre-authorized at booking; George settles the match deterministically.
    const result = await acceptQuoteTx(db, reqRow, quote.id, "system", "george:dispatch");
    if (!result.ok) return { ok: false, error: result.error };
    // The human on the van (crew member or the owner themselves).
    await db
      .from("work_orders")
      .update({ assigned_staff_contact_id: resolved.contact_id })
      .eq("request_id", reqRow.id);
    return { ok: true, requestId: reqRow.id as string };
  },

  async setTradiePresence(tradiePortalToken, online, geo) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, online: false };
    const db = serviceClient();
    const { data: contact } = await db.from("contacts").select("org_id").eq("id", resolved.contact_id).maybeSingle();
    if (!contact) return { ok: false, online: false };
    await db.from("tradie_presence").upsert({
      tradie_contact_id: resolved.contact_id,
      org_id: contact.org_id,
      online,
      ...(geo ? { last_lat: geo.lat, last_lng: geo.lng } : {}),
      updated_at: new Date().toISOString(),
    });
    return { ok: true, online };
  },

  async getTradiePresence(tradiePortalToken) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { online: false };
    const db = serviceClient();
    const { data } = await db
      .from("tradie_presence")
      .select("online")
      .eq("tradie_contact_id", resolved.contact_id)
      .maybeSingle();
    return { online: Boolean(data?.online) };
  },

  async markOnMyWay(tradiePortalToken, workOrderId) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, tradie_contact_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    await db.from("work_orders").update({ on_the_way_at: new Date().toISOString() }).eq("id", wo.id);
    // George's real ETA (v8 R5a): tradie's last position × the property's
    // verified coordinates. Null when either side lacks geo — the ping goes
    // out without a number rather than with a made-up one.
    let etaMinutes: number | null = null;
    const [{ data: presence }, { data: woReq }] = await Promise.all([
      db.from("tradie_presence").select("last_lat, last_lng").eq("tradie_contact_id", resolved.contact_id).maybeSingle(),
      db.from("work_orders").select("request_id").eq("id", wo.id).maybeSingle(),
    ]);
    if (presence?.last_lat != null && presence.last_lng != null && woReq) {
      const { data: reqProp } = await db
        .from("maintenance_requests")
        .select("properties(lat, lng)")
        .eq("id", woReq.request_id)
        .maybeSingle();
      const prop = Array.isArray((reqProp as { properties: unknown } | null)?.properties)
        ? ((reqProp as { properties: Array<{ lat: number | null; lng: number | null }> }).properties[0] ?? null)
        : ((reqProp as { properties: { lat: number | null; lng: number | null } | null } | null)?.properties ?? null);
      if (prop?.lat != null && prop.lng != null) {
        etaMinutes = etaMinutesFromDistance(
          haversineKm(Number(presence.last_lat), Number(presence.last_lng), Number(prop.lat), Number(prop.lng)),
        );
      }
    }
    return { ok: true, etaMinutes };
  },

  async addJobEvidence(tradiePortalToken, workOrderId, input) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    await db.from("job_evidence").insert({
      org_id: wo.org_id,
      work_order_id: wo.id,
      gate: input.gate,
      data_url: input.dataUrl,
      note: input.note ?? null,
    });
    const { data: reqRow } = await db
      .from("maintenance_requests")
      .select("playbook_key")
      .eq("id", wo.request_id)
      .maybeSingle();
    const playbook = reqRow?.playbook_key ? getPlaybook(reqRow.playbook_key) : null;
    const remaining = playbook ? unsatisfiedGates(playbook, await evidenceItemsFor(db, wo.id)) : [];
    return { ok: true, gatesRemaining: remaining };
  },

  async completeJob(tradiePortalToken, workOrderId, note) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id, on_site_started_at, estimated_minutes")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, status, playbook_key")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };

    // Core rule, not UI hope: the playbook's gates block completion.
    const playbook = req.playbook_key ? getPlaybook(req.playbook_key) : null;
    if (playbook) {
      const gate = checkPlaybookGate(playbook, "submit_evidence", await evidenceItemsFor(db, wo.id));
      if (!gate.ok) return { ok: false, gatesRemaining: gate.missing, error: gate.message };
    }

    const result = transition(req.status as RequestState, "submit_evidence", "tradie");
    if (!result.ok) return { ok: false, error: `Cannot mark this done from state "${req.status}".` };
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "submit_evidence",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
      payload: { note },
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);

    // The learning loop closes (archive: TRADIE-JOBS-046): actual on-site
    // minutes captured against the estimate and written to the ledger.
    const actualMinutes = wo.on_site_started_at
      ? Math.max(1, Math.round((Date.now() - new Date(wo.on_site_started_at).getTime()) / 60_000))
      : null;
    const estimated = wo.estimated_minutes != null ? Number(wo.estimated_minutes) : null;
    await db
      .from("work_orders")
      .update({ status: result.state, completion_note: note, actual_minutes: actualMinutes })
      .eq("id", wo.id);
    if (actualMinutes !== null && estimated !== null && estimated > 0) {
      const accuracy = computeTimeAccuracy(estimated, actualMinutes);
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "work_order",
        aggregate_id: wo.id,
        event_type: "actuals_captured",
        actor_type: "system",
        actor_id: "quintino:learning-loop",
        payload: {
          estimatedMinutes: estimated,
          actualMinutes,
          signedVariancePct: Math.round(accuracy.signedVariancePct),
          rating: accuracy.rating,
        },
      });
    }
    return { ok: true };
  },

  async verifyAndSettle(token, requestId) {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, status, playbook_key")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    if (row.scope === "tenant_intake") {
      if (req.property_id !== row.aggregate_id) return { ok: false, error: "Request not found." };
    } else {
      const { data: prop } = await db
        .from("properties")
        .select("owner_contact_id")
        .eq("id", req.property_id)
        .maybeSingle();
      if (prop?.owner_contact_id !== row.aggregate_id) return { ok: false, error: "Request not found." };
    }

    const actorType = row.scope === "tenant_intake" ? "tenant" : "agency_user";
    return verifySettleCore(db, req, { actorType: actorType as ActorType, actorId: `token:${row.id}` });
  },

  async getJobProjection(token, requestId): Promise<JobProjection | null> {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal", "pm_portfolio", "tradie_portal"]);
    if (!row) return null;
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select(
        "id, org_id, property_id, title, description, category, status, estimate_cents, warranty_claim_of_work_order_id, playbook_key, booked_start_at, booked_end_at",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return null;

    const { data: prop } = await db
      .from("properties")
      .select("address_line1, suburb, state, postcode, owner_contact_id, pm_contact_id")
      .eq("id", req.property_id)
      .maybeSingle();

    let viewer: JobViewer;
    if (row.scope === "tenant_intake") {
      if (req.property_id !== row.aggregate_id) return null;
      viewer = "occupant";
    } else if (row.scope === "owner_portal") {
      if (prop?.owner_contact_id !== row.aggregate_id) return null;
      viewer = "payer";
    } else if (row.scope === "pm_portfolio") {
      if (prop?.pm_contact_id !== row.contact_id) return null;
      viewer = "pm";
    } else {
      const bizId = row.contact_id ? await tradieBusinessId(db, row.contact_id) : null;
      const { data: mine } = await db
        .from("quotes")
        .select("id")
        .eq("request_id", req.id)
        .eq("tradie_contact_id", bizId ?? "")
        .limit(1);
      if (!mine || mine.length === 0) return null;
      viewer = "tradie";
    }

    const [{ data: ev }, { data: wo }, { data: paymentRows }, { data: varianceRow }] = await Promise.all([
      db
        .from("events")
        .select("event_type, actor_type, payload, created_at")
        .eq("aggregate_type", "maintenance_request")
        .eq("aggregate_id", req.id)
        .order("id", { ascending: true }),
      db
        .from("work_orders")
        .select(
          "id, tradie_contact_id, assigned_staff_contact_id, on_the_way_at, scheduled_start_at, scheduled_end_at, completion_note, estimated_minutes, actual_minutes, contacts(full_name)",
        )
        .eq("request_id", req.id)
        .maybeSingle(),
      db.from("payments").select("status, amount_cents").eq("request_id", req.id),
      db
        .from("variances")
        .select("id, booked_cents, new_total_cents, reason, status, photo_data_url")
        .eq("request_id", req.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const payment = aggregatePayments(
      (paymentRows ?? []) as Array<{ status: string; amount_cents: number }>,
    );

    const woRow = wo as {
      id: string;
      on_the_way_at: string | null;
      scheduled_start_at: string | null;
      scheduled_end_at: string | null;
      completion_note: string | null;
      estimated_minutes: number | null;
      actual_minutes: number | null;
      contacts: ContactJoin | ContactJoin[] | null;
    } | null;
    let tradieName = normalizeContact(woRow?.contacts ?? null)?.full_name ?? null;
    // Crews: the face on the job is the ASSIGNED STAFF member, with the
    // business behind them.
    const staffId = (wo as { assigned_staff_contact_id?: string | null } | null)?.assigned_staff_contact_id;
    if (staffId && staffId !== woRow?.id) {
      const staffName = await contactName(db, staffId);
      if (staffName && tradieName && staffName !== tradieName) tradieName = `${staffName} (${tradieName})`;
      else if (staffName) tradieName = staffName;
    }
    if (!tradieName) {
      const { data: acceptedQuote } = await db
        .from("quotes")
        .select("contacts(full_name)")
        .eq("request_id", req.id)
        .eq("status", "accepted")
        .maybeSingle();
      tradieName = normalizeContact((acceptedQuote as { contacts: ContactJoin | ContactJoin[] | null } | null)?.contacts ?? null)?.full_name ?? null;
    }

    const [ownerName, pmName, occupantName] = await Promise.all([
      prop?.owner_contact_id ? contactName(db, prop.owner_contact_id) : Promise.resolve(null),
      prop?.pm_contact_id ? contactName(db, prop.pm_contact_id) : Promise.resolve(null),
      (async () => {
        const { data: t } = await db.from("contacts").select("full_name").eq("org_id", req.org_id).eq("kind", "tenant").limit(1);
        return (t?.[0]?.full_name as string | undefined) ?? null;
      })(),
    ]);

    let parts: JobSource["parts"] = [];
    if (woRow) {
      const { data: partRows } = await db
        .from("job_parts")
        .select("id, label, cost_cents, status")
        .eq("work_order_id", woRow.id)
        .order("created_at", { ascending: true });
      parts = ((partRows ?? []) as Array<{ id: string; label: string; cost_cents: number; status: string }>).map((pt) => ({
        id: pt.id,
        label: pt.label,
        costCents: Number(pt.cost_cents),
        status: pt.status as JobSource["parts"][number]["status"],
      }));
    }

    let evidence: JobSource["evidence"] = [];
    if (woRow) {
      const { data: evRows } = await db
        .from("job_evidence")
        .select("gate, data_url, note, created_at")
        .eq("work_order_id", woRow.id)
        .order("created_at", { ascending: true });
      evidence = ((evRows ?? []) as Array<{ gate: string; data_url: string | null; note: string | null; created_at: string }>).map(
        (e) => ({ gate: e.gate, dataUrl: e.data_url, note: e.note, at: e.created_at }),
      );
    }

    const source: JobSource = {
      request: {
        id: req.id,
        title: req.title,
        description: req.description,
        category: req.category as RequestCategory,
        estimateCents: req.estimate_cents,
        state: req.status as RequestState,
        isWarrantyClaim: Boolean(req.warranty_claim_of_work_order_id),
        events: ((ev ?? []) as Array<{ event_type: string; actor_type: string; payload: Record<string, unknown> | null; created_at: string }>).map(
          (e) => ({
            eventType: e.event_type as RequestEvent,
            actorType: e.actor_type as ActorType,
            note: typeof e.payload?.note === "string" ? e.payload.note : undefined,
            at: e.created_at,
          }),
        ),
        playbookKey: req.playbook_key ?? null,
        bookedSlot: req.booked_start_at
          ? { startAt: req.booked_start_at, endAt: req.booked_end_at ?? req.booked_start_at }
          : null,
      },
      propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
      workOrder: woRow
        ? {
            id: woRow.id,
            onTheWayAt: woRow.on_the_way_at,
            scheduledStartAt: woRow.scheduled_start_at,
            scheduledEndAt: woRow.scheduled_end_at,
            completionNote: woRow.completion_note,
            estimatedMinutes: woRow.estimated_minutes != null ? Number(woRow.estimated_minutes) : null,
            actualMinutes: woRow.actual_minutes != null ? Number(woRow.actual_minutes) : null,
          }
        : null,
      tradie: tradieName ? { name: tradieName, verified: true } : null,
      ownerName,
      pmName,
      occupantName,
      payment,
      evidence,
      variance: varianceRow
        ? {
            id: varianceRow.id,
            bookedCents: Number(varianceRow.booked_cents),
            newTotalCents: Number(varianceRow.new_total_cents),
            reason: varianceRow.reason,
            status: varianceRow.status as VarianceView["status"],
            photoDataUrl: (varianceRow as { photo_data_url?: string | null }).photo_data_url ?? null,
          }
        : null,
      parts,
    };
    return projectJob(source, viewer);
  },

  async getAddressRecord(token, propertyId): Promise<AddressRecordView | null> {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal", "pm_portfolio"]);
    if (!row) return null;
    const db = serviceClient();
    let pid: string | null = null;
    let showMoney = true;
    if (row.scope === "tenant_intake") {
      pid = row.aggregate_id;
      showMoney = false;
    } else if (row.scope === "owner_portal") {
      const { data: owned } = await db.from("properties").select("id").eq("owner_contact_id", row.aggregate_id);
      const ownedIds = ((owned ?? []) as Array<{ id: string }>).map((p) => p.id);
      pid = propertyId && ownedIds.includes(propertyId) ? propertyId : (ownedIds[0] ?? null);
    } else {
      const { data: managed } = await db.from("properties").select("id").eq("pm_contact_id", row.contact_id);
      const managedIds = ((managed ?? []) as Array<{ id: string }>).map((p) => p.id);
      pid = propertyId && managedIds.includes(propertyId) ? propertyId : null;
    }
    if (!pid) return null;

    const detail = await supabaseData.getProperty(pid);
    if (!detail) return null;

    const { data: historyRows } = await db
      .from("work_orders")
      .select(
        "invoice_cents, invoiced_at, contacts(full_name), maintenance_requests!work_orders_request_id_fkey!inner(title, category, property_id)",
      )
      .not("invoice_cents", "is", null)
      .eq("maintenance_requests.property_id", pid)
      .order("invoiced_at", { ascending: false });
    const history = ((historyRows ?? []) as unknown as Array<{
      invoice_cents: number;
      invoiced_at: string | null;
      contacts: ContactJoin | ContactJoin[] | null;
      maintenance_requests: { title: string; category: string } | { title: string; category: string }[] | null;
    }>).map((r) => {
      const req = Array.isArray(r.maintenance_requests) ? r.maintenance_requests[0] : r.maintenance_requests;
      return {
        title: req?.title ?? "",
        category: (req?.category ?? "other") as RequestCategory,
        invoiceCents: showMoney ? Number(r.invoice_cents) : null,
        tradieName: normalizeContact(r.contacts)?.full_name ?? "Verified tradie",
        at: r.invoiced_at,
      };
    });

    const { count: eventsCount } = await db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", (await db.from("properties").select("org_id").eq("id", pid).maybeSingle()).data?.org_id ?? "")
      .eq("aggregate_type", "maintenance_request");

    return {
      propertyId: pid,
      address: detail.address,
      suburb: detail.suburb,
      compliance: {
        propertyAddress: `${detail.address}, ${detail.suburb}`,
        overall: detail.compliance.overall,
        requirements: detail.compliance.requirements.map((r) => ({
          name: r.requirement.name,
          status: r.status,
          lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
          dueAt: r.dueAt?.toISOString() ?? null,
        })),
      },
      assets: await supabaseAssetsFor(db, pid),
      history,
      warranties: detail.openWarranties.map((w) => ({
        assetLabel: w.assetLabel,
        tradieName: w.tradieName,
        expiresAt: w.expiresAt,
      })),
      spend12moCents: showMoney ? (await spendingForProperties(db, [pid], 12)).totalCents : null,
      eventsCount: eventsCount ?? 0,
    };
  },

  async getDeckTiles(pmPortfolioToken): Promise<DeckTile[]> {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return [];
    const db = serviceClient();
    const { data: managed } = await db.from("properties").select("id, address_line1").eq("pm_contact_id", resolved.contact_id);
    const managedRows = (managed ?? []) as Array<{ id: string; address_line1: string }>;
    if (managedRows.length === 0) return [];
    const { data: reqs } = await db
      .from("maintenance_requests")
      .select("id, title, status, property_id, reported_at")
      .in("property_id", managedRows.map((p) => p.id))
      .order("reported_at", { ascending: false })
      .limit(40);
    const tiles: DeckTile[] = [];
    for (const r of (reqs ?? []) as Array<{ id: string; title: string; status: string; property_id: string; reported_at: string }>) {
      const [{ data: wo }, { data: paymentRows }] = await Promise.all([
        db.from("work_orders").select("on_the_way_at").eq("request_id", r.id).maybeSingle(),
        db.from("payments").select("status, amount_cents").eq("request_id", r.id),
      ]);
      const payment = aggregatePayments((paymentRows ?? []) as Array<{ status: string; amount_cents: number }>);
      tiles.push({
        requestId: r.id,
        title: r.title,
        address: managedRows.find((p) => p.id === r.property_id)?.address_line1 ?? "",
        state: r.status as RequestState,
        arcStep: arcStepFor(r.status as RequestState, {
          onTheWay: Boolean(wo?.on_the_way_at),
          captured: payment?.status === "captured" || payment?.status === "transferred",
        }),
        needsHuman: ["pending_approval", "evidence_pending"].includes(r.status),
        at: r.reported_at,
      });
    }
    return tiles;
  },

  // ——— v8 R2: Autopilot & the Deck ———

  async savePushSubscription(token, input) {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal", "pm_portfolio", "tradie_portal"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const contactId = row.contact_id ?? (row.scope === "owner_portal" || row.scope === "pm_portfolio" || row.scope === "tradie_portal" ? row.aggregate_id : null);
    if (!contactId) return { ok: false, error: "This link has no person attached." };
    const db = serviceClient();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        org_id: row.org_id,
        contact_id: contactId,
        endpoint: input.endpoint,
        keys: input.keys,
        home_path: input.homePath,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async getPushTargets(requestId, role) {
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return [];
    const contactIds: string[] = [];
    if (role === "payer") {
      const { data: prop } = await db.from("properties").select("owner_contact_id").eq("id", req.property_id).maybeSingle();
      if (prop?.owner_contact_id) contactIds.push(prop.owner_contact_id);
    } else if (role === "occupant") {
      const { data: tenancy } = await db
        .from("tenancies")
        .select("tenant_contact_id")
        .eq("property_id", req.property_id)
        .is("end_date", null)
        .maybeSingle();
      if (tenancy?.tenant_contact_id) contactIds.push(tenancy.tenant_contact_id);
    } else if (role === "assigned_tradie") {
      const { data: wo } = await db.from("work_orders").select("tradie_contact_id").eq("request_id", req.id).maybeSingle();
      if (wo?.tradie_contact_id) contactIds.push(wo.tradie_contact_id);
    } else if (role === "tradie_offered") {
      const { data: qs } = await db.from("quotes").select("tradie_contact_id").eq("request_id", req.id).eq("status", "invited");
      for (const q of (qs ?? []) as Array<{ tradie_contact_id: string }>) contactIds.push(q.tradie_contact_id);
    } else if (role === "pm") {
      const { data: prop } = await db.from("properties").select("pm_contact_id").eq("id", req.property_id).maybeSingle();
      const pmId = (prop as { pm_contact_id?: string | null } | null)?.pm_contact_id;
      if (pmId) contactIds.push(pmId);
    }
    if (contactIds.length === 0) return [];
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("contact_id, endpoint, keys, home_path, contacts(full_name)")
      .in("contact_id", contactIds);
    return ((subs ?? []) as Array<{
      contact_id: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
      home_path: string | null;
      contacts: { full_name: string } | { full_name: string }[] | null;
    }>).map((s) => ({
      contactId: s.contact_id,
      name: (Array.isArray(s.contacts) ? s.contacts[0]?.full_name : s.contacts?.full_name) ?? "",
      endpoint: s.endpoint,
      keys: s.keys,
      homePath: s.home_path,
    }));
  },

  async mintMomentAction(requestId, input) {
    const db = serviceClient();
    const { data: req } = await db.from("maintenance_requests").select("id, org_id").eq("id", requestId).maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    const issued = issueToken("moment_action");
    const { error } = await db.from("access_tokens").insert({
      org_id: req.org_id,
      token_hash: issued.tokenHash,
      scope: "moment_action",
      aggregate_id: requestId,
      contact_id: input.contactId,
      expires_at: issued.expiresAt.toISOString(),
      payload: { kind: input.kind, ...(input.meta ?? {}) },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path: `/api/act/${issued.token}` };
  },

  async executeMomentAction(rawToken, choice) {
    const db = serviceClient();
    const { data: row } = await db
      .from("access_tokens")
      .select("id, org_id, aggregate_id, contact_id, scope, expires_at, used_at, payload")
      .eq("token_hash", hashToken(rawToken))
      .eq("scope", "moment_action")
      .maybeSingle();
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false, error: "This decision link has expired or was already used." };
    }
    const payload = (row.payload ?? {}) as { kind?: MomentActionKind; actorType?: string };
    const requestId = row.aggregate_id as string;
    // Burn first — a raced second tap must lose.
    const { data: burned } = await db
      .from("access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id");
    if (!burned || burned.length === 0) return { ok: false, error: "This decision was already taken." };

    if (payload.kind === "approve_request") {
      if (choice !== "approve" && choice !== "decline") return { ok: false, error: "Unknown choice." };
      const { data: req } = await db.from("maintenance_requests").select("id, org_id, status").eq("id", requestId).maybeSingle();
      if (!req) return { ok: false, error: "Request not found." };
      const result = transition(req.status as RequestState, choice, "landlord");
      if (!result.ok) return { ok: false, error: `This request is ${String(req.status).replace(/_/g, " ")} — no decision is pending.` };
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "maintenance_request",
        aggregate_id: req.id,
        event_type: choice,
        actor_type: "landlord",
        actor_id: `moment:${row.id}`,
      });
      await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);
      return { ok: true, label: choice === "approve" ? "Approved" : "Declined", requestId };
    }

    if (payload.kind === "verify_job") {
      const { data: req } = await db
        .from("maintenance_requests")
        .select("id, org_id, property_id, status, playbook_key")
        .eq("id", requestId)
        .maybeSingle();
      if (!req) return { ok: false, error: "Request not found." };
      const actorType = (payload.actorType === "tenant" ? "tenant" : "agency_user") as ActorType;
      const result = await verifySettleCore(db, req, { actorType, actorId: `moment:${row.id}` });
      return result.ok ? { ok: true, label: "Verified — payment released", requestId } : { ok: false, error: result.error };
    }

    if (payload.kind === "fund_job") {
      const { data: req } = await db
        .from("maintenance_requests")
        .select("id, org_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (!req) return { ok: false, error: "Request not found." };
      const result = await fundJobCore(db, req, `moment:${row.id}`);
      return result.ok ? { ok: true, label: "Paid — tradie gets it today", requestId } : { ok: false, error: result.error };
    }

    if (payload.kind === "decide_variance") {
      if (choice !== "approve" && choice !== "decline") return { ok: false, error: "Unknown choice." };
      const varianceId = (row.payload as { varianceId?: string } | null)?.varianceId;
      if (!varianceId) return { ok: false, error: "This decision link is malformed." };
      const result = await decideVarianceCore(db, varianceId, choice, `moment:${row.id}`);
      return result.ok
        ? { ok: true, label: choice === "approve" ? "Extra work approved" : "Kept to the booked scope", requestId }
        : { ok: false, error: result.error };
    }

    return { ok: false, error: "Unknown decision kind." };
  },

  async getAutopilot(ownerToken) {
    const resolved = await resolveToken(ownerToken, "owner_portal");
    if (!resolved) return null;
    const db = serviceClient();
    const { data: props } = await db.from("properties").select("id").eq("owner_contact_id", resolved.aggregate_id);
    const propertyIds = ((props ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (propertyIds.length === 0) {
      return { enabled: false, maxTotalCents: 50_000, minTrustScore: 60, safetyCategories: AUTOPILOT_SAFETY_CATEGORIES, propertiesCovered: 0 };
    }
    const { data: rules } = await db
      .from("approval_policy_rules")
      .select("property_id, max_total_cents, min_trust_score, exclude_categories, enabled")
      .in("property_id", propertyIds)
      .eq("priority", AUTOPILOT_RULE_PRIORITY);
    const ruleRows = (rules ?? []) as Array<{ max_total_cents: number | null; min_trust_score: number | null; exclude_categories: string[]; enabled: boolean }>;
    const active = ruleRows.find((r) => r.enabled) ?? ruleRows[0];
    return {
      enabled: Boolean(active?.enabled),
      maxTotalCents: active?.max_total_cents != null ? Number(active.max_total_cents) : 50_000,
      minTrustScore: active?.min_trust_score != null ? Number(active.min_trust_score) : 60,
      safetyCategories:
        active && active.exclude_categories.length === 0 ? [] : AUTOPILOT_SAFETY_CATEGORIES,
      propertiesCovered: propertyIds.length,
    };
  },

  async setAutopilot(ownerToken, input) {
    const resolved = await resolveToken(ownerToken, "owner_portal");
    if (!resolved) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: props } = await db
      .from("properties")
      .select("id, org_id")
      .eq("owner_contact_id", resolved.aggregate_id);
    const propRows = (props ?? []) as Array<{ id: string; org_id: string }>;
    if (propRows.length === 0) return { ok: false, error: "No properties on this seat." };
    for (const prop of propRows) {
      await db
        .from("approval_policy_rules")
        .delete()
        .eq("property_id", prop.id)
        .eq("priority", AUTOPILOT_RULE_PRIORITY);
      const { error } = await db.from("approval_policy_rules").insert({
        org_id: prop.org_id,
        property_id: prop.id,
        priority: AUTOPILOT_RULE_PRIORITY,
        max_total_cents: input.maxTotalCents,
        min_trust_score: input.minTrustScore,
        exclude_categories: input.safetyOn ? AUTOPILOT_SAFETY_CATEGORIES : [],
        enabled: input.enabled,
      });
      if (error) return { ok: false, error: error.message };
    }
    // The setting itself is a human act on the record.
    await db.from("events").insert({
      org_id: propRows[0]!.org_id,
      aggregate_type: "property",
      aggregate_id: propRows[0]!.id,
      event_type: "policy_updated",
      actor_type: "landlord",
      actor_id: `token:${resolved.id}`,
      payload: {
        autopilot: input.enabled,
        maxTotalCents: input.maxTotalCents,
        minTrustScore: input.minTrustScore,
        safetyOn: input.safetyOn,
        properties: propRows.length,
      },
    });
    return { ok: true };
  },

  async getTradieRun(tradiePortalToken) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    const { data: wos } = await db
      .from("work_orders")
      .select(
        "id, request_id, status, scheduled_start_at, scheduled_end_at, assigned_staff_contact_id, maintenance_requests!work_orders_request_id_fkey!inner(id, title, status, playbook_key, booked_start_at, booked_end_at, properties(address_line1, suburb))",
      )
      .eq("tradie_contact_id", bizId)
      .in("status", ["scheduled", "in_progress"]);
    const isStaff = bizId !== resolved.contact_id;
    const jobs: RunJob[] = [];
    const meta = new Map<string, { address: string; state: RequestState; slotLabel: string | null }>();
    for (const wo of (wos ?? []) as unknown as Array<{
      id: string;
      request_id: string;
      status: string;
      assigned_staff_contact_id?: string | null;
      scheduled_start_at: string | null;
      scheduled_end_at: string | null;
      maintenance_requests: {
        id: string;
        title: string;
        status: string;
        playbook_key: string | null;
        booked_start_at: string | null;
        booked_end_at: string | null;
        properties: { address_line1: string; suburb: string } | { address_line1: string; suburb: string }[] | null;
      };
    }>) {
      // A staff member's run is THEIR jobs (assigned to them, or unassigned).
      if (isStaff && wo.assigned_staff_contact_id && wo.assigned_staff_contact_id !== resolved.contact_id) continue;
      const req = wo.maintenance_requests;
      const prop = Array.isArray(req.properties) ? req.properties[0] : req.properties;
      const playbook = req.playbook_key ? getPlaybook(req.playbook_key) : null;
      const startIso = wo.scheduled_start_at ?? req.booked_start_at;
      const endIso = wo.scheduled_end_at ?? req.booked_end_at;
      jobs.push({
        workOrderId: wo.id,
        requestId: req.id,
        title: req.title,
        address: prop?.address_line1 ?? "",
        suburb: prop?.suburb ?? "",
        slotStartAt: startIso ? new Date(startIso) : null,
        slotEndAt: endIso ? new Date(endIso) : null,
        typicalMinutes: playbook?.typicalMinutes ?? 90,
        urgent: false,
      });
      meta.set(wo.id, {
        address: prop ? `${prop.address_line1}, ${prop.suburb}` : "",
        state: req.status as RequestState,
        slotLabel: startIso ? formatSlot({ startAt: new Date(startIso), endAt: new Date(endIso ?? startIso) }) : null,
      });
    }
    const run = buildRun(jobs, { dayStart: new Date() });
    const busy = await calendarBusyWindows(db, resolved.contact_id);
    return {
      legs: run.legs.map((l) => ({
        workOrderId: l.job.workOrderId,
        requestId: l.job.requestId,
        title: l.job.title,
        address: meta.get(l.job.workOrderId)?.address ?? l.job.address,
        suburb: l.job.suburb,
        travelMinutes: l.travelMinutes,
        arriveAt: l.arriveAt.toISOString(),
        departAt: l.departAt.toISOString(),
        conflict: l.conflict,
        slotLabel: meta.get(l.job.workOrderId)?.slotLabel ?? null,
        state: meta.get(l.job.workOrderId)?.state ?? "scheduled",
      })),
      totalTravelMinutes: run.totalTravelMinutes,
      totalOnSiteMinutes: run.totalOnSiteMinutes,
      calendarBusy: busy,
    };
  },

  // ——— v8 R3: Real money & the second orbit ———

  async proposeVariance(tradiePortalToken, workOrderId, input) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id, quote_cents, call_out_fee_cents, status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    if ((wo.status as RequestState) !== "in_progress") {
      return { ok: false, error: "Scope changes are raised on site, while the job is in progress." };
    }
    const { data: pending } = await db
      .from("variances")
      .select("id")
      .eq("work_order_id", wo.id)
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length > 0) return { ok: false, error: "A scope change is already waiting on the payer." };

    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, playbook_key, title")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    const playbook = (req.playbook_key ? getPlaybook(req.playbook_key) : null) ?? PLAYBOOKS.general_quote_race;
    const { data: payRows } = await db
      .from("payments")
      .select("amount_cents, status")
      .eq("request_id", req.id);
    const bookedCents =
      ((payRows ?? []) as Array<{ amount_cents: number; status: string }>)
        .filter((p) => p.status !== "voided")
        .reduce((s, p) => s + Number(p.amount_cents), 0) ||
      Number(wo.quote_cents ?? 0) + Number(wo.call_out_fee_cents ?? 0);
    if (input.newTotalCents <= 0 || !input.reason.trim()) return { ok: false, error: "A new total and a reason are required." };

    const needsApproval = varianceNeedsApproval(playbook, bookedCents, input.newTotalCents);
    const status = needsApproval ? "pending" : "auto_applied";
    const { data: variance, error } = await db
      .from("variances")
      .insert({
        org_id: wo.org_id,
        request_id: req.id,
        work_order_id: wo.id,
        booked_cents: bookedCents,
        new_total_cents: input.newTotalCents,
        reason: input.reason.trim(),
        photo_data_url: input.photoDataUrl ?? null,
        status,
        decided_at: needsApproval ? null : new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !variance) return { ok: false, error: error?.message ?? "Could not record the change." };

    await db.from("events").insert({
      org_id: wo.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: needsApproval ? "variance_proposed" : "variance_auto_applied",
      actor_type: "tradie",
      actor_id: `contact:${resolved.contact_id}`,
      payload: {
        bookedCents,
        newTotalCents: input.newTotalCents,
        reason: input.reason.trim(),
        thresholdPct: playbook.varianceThresholdPct,
      },
    });

    if (!needsApproval) {
      // Inside the playbook's threshold: the delta rides as a variance slice,
      // captured with the balance on verify.
      await applyVarianceSlice(db, req.id, wo.org_id, input.newTotalCents - bookedCents);
    }
    return { ok: true, needsApproval, varianceId: variance.id as string };
  },

  async decideVariance(token, varianceId, decision) {
    const row = await resolveTokenAny(token, ["owner_portal", "pm_portfolio"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    // Scope: the variance's property must belong to this seat.
    const { data: v } = await db
      .from("variances")
      .select("id, request_id, maintenance_requests!variances_request_id_fkey!inner(property_id)")
      .eq("id", varianceId)
      .maybeSingle();
    if (!v) return { ok: false, error: "Not found." };
    const propId = (v as unknown as { maintenance_requests: { property_id: string } }).maintenance_requests.property_id;
    const { data: prop } = await db
      .from("properties")
      .select("owner_contact_id, pm_contact_id")
      .eq("id", propId)
      .maybeSingle();
    const allowed =
      (row.scope === "owner_portal" && prop?.owner_contact_id === row.aggregate_id) ||
      (row.scope === "pm_portfolio" && prop?.pm_contact_id === row.contact_id);
    if (!allowed) return { ok: false, error: "Not found." };
    return decideVarianceCore(db, varianceId, decision, `token:${row.id}`);
  },

  async getFastPay(tradiePortalToken) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    return { enabled: await tradieFastPayEnabled(db, resolved.contact_id) };
  },

  async setFastPay(tradiePortalToken, enabled) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { error } = await db
      .from("tradie_rate_cards")
      .update({ fastpay_enabled: enabled })
      .eq("tradie_contact_id", resolved.contact_id);
    if (error) return { ok: false, error: error.message };
    await db.from("events").insert({
      org_id: resolved.org_id,
      aggregate_type: "contact",
      aggregate_id: resolved.contact_id,
      event_type: "fastpay_setting",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
      payload: { enabled },
    });
    return { ok: true };
  },

  // ——— v8 R3.5: parts to job + the learning loop ———

  async addJobPart(tradiePortalToken, workOrderId, input) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, request_id, tradie_contact_id, status, quote_cents, call_out_fee_cents")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    if ((wo.status as RequestState) !== "in_progress") {
      return { ok: false, error: "Parts are booked on site, while the job is in progress." };
    }
    const label = input.label.trim();
    if (!label || !Number.isFinite(input.costCents) || input.costCents <= 0) {
      return { ok: false, error: "A part needs a name and a cost." };
    }
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, playbook_key, category")
      .eq("id", wo.request_id)
      .maybeSingle();
    if (!req) return { ok: false, error: "Request not found." };
    const playbook =
      (req.playbook_key ? getPlaybook(req.playbook_key) : null) ?? playbookForCategory(req.category as RequestCategory);
    const { data: payRows } = await db.from("payments").select("amount_cents, status").eq("request_id", req.id);
    const bookedCents =
      ((payRows ?? []) as Array<{ amount_cents: number; status: string }>)
        .filter((p) => p.status !== "voided")
        .reduce((s, p) => s + Number(p.amount_cents), 0) ||
      Number(wo.quote_cents ?? 0) + Number(wo.call_out_fee_cents ?? 0);
    const needsApproval = varianceNeedsApproval(playbook, bookedCents, bookedCents + input.costCents);

    if (!needsApproval) {
      const { error } = await db.from("job_parts").insert({
        org_id: wo.org_id,
        work_order_id: wo.id,
        label,
        cost_cents: input.costCents,
        status: "active",
      });
      if (error) return { ok: false, error: error.message };
      await db.from("events").insert({
        org_id: wo.org_id,
        aggregate_type: "work_order",
        aggregate_id: wo.id,
        event_type: "part_added",
        actor_type: "tradie",
        actor_id: `contact:${resolved.contact_id}`,
        payload: { label, costCents: input.costCents, withinThreshold: true },
      });
      await applyVarianceSlice(db, req.id, wo.org_id, input.costCents);
      return { ok: true, needsApproval: false };
    }

    // Beyond the threshold: the part rides the variance protocol — work
    // pauses, the payer decides, no surprise bills.
    const { data: variance, error: vError } = await db
      .from("variances")
      .insert({
        org_id: wo.org_id,
        request_id: req.id,
        work_order_id: wo.id,
        booked_cents: bookedCents,
        new_total_cents: bookedCents + input.costCents,
        reason: `Part needed: ${label}`,
        status: "pending",
      })
      .select("id")
      .single();
    if (vError || !variance) return { ok: false, error: vError?.message ?? "Could not record the part." };
    const { error: pError } = await db.from("job_parts").insert({
      org_id: wo.org_id,
      work_order_id: wo.id,
      label,
      cost_cents: input.costCents,
      status: "pending_approval",
      variance_id: variance.id,
    });
    if (pError) return { ok: false, error: pError.message };
    await db.from("events").insert({
      org_id: wo.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: "part_proposed",
      actor_type: "tradie",
      actor_id: `contact:${resolved.contact_id}`,
      payload: { label, costCents: input.costCents, varianceId: variance.id },
    });
    return { ok: true, needsApproval: true, varianceId: variance.id as string };
  },

  // ——— v8 R4b: warranty identity ———

  async setAssetDetails(tradiePortalToken, workOrderId, input) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: wo } = await db
      .from("work_orders")
      .select("id, org_id, tradie_contact_id, status")
      .eq("id", workOrderId)
      .maybeSingle();
    if (!wo || wo.tradie_contact_id !== (await tradieBusinessId(db, resolved.contact_id))) return { ok: false, error: "Job not found." };
    if (!["in_progress", "evidence_pending"].includes(wo.status as string)) {
      return { ok: false, error: "Asset details are recorded on site." };
    }
    const manufacturer = input.manufacturer.trim().slice(0, 80);
    const model = input.model.trim().slice(0, 80);
    const serial = input.serial.trim().slice(0, 80);
    const receipt = input.receipt?.dataUrl?.startsWith("data:") ? input.receipt : null;
    if (!manufacturer && !model && !serial && !receipt) return { ok: false, error: "Nothing to record." };
    await db
      .from("work_orders")
      .update({
        asset_manufacturer: manufacturer || null,
        asset_model: model || null,
        asset_serial: serial || null,
        ...(receipt
          ? {
              receipt_data_url: receipt.dataUrl,
              asset_purchased_at: receipt.purchasedAt || null,
              asset_warranty_months: Math.max(0, Math.min(240, Math.round(receipt.warrantyMonths))) || null,
            }
          : {}),
      })
      .eq("id", wo.id);
    await db.from("events").insert({
      org_id: wo.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: "asset_identified",
      actor_type: "tradie",
      actor_id: `contact:${resolved.contact_id}`,
      payload: { manufacturer, model, serial, receiptAttached: Boolean(receipt) },
    });
    return { ok: true };
  },

  // ——— v8 R6: feedback, performance, same-day funding ———

  async submitReview(token, requestId, input) {
    const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const rating = Math.round(input.rating);
    if (rating < 1 || rating > 5) return { ok: false, error: "Rating is 1 to 5 stars." };
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false, error: "Job not found." };
    if (row.scope === "tenant_intake") {
      if (req.property_id !== row.aggregate_id) return { ok: false, error: "Job not found." };
    } else {
      const { data: prop } = await db.from("properties").select("owner_contact_id").eq("id", req.property_id).maybeSingle();
      if (prop?.owner_contact_id !== row.aggregate_id) return { ok: false, error: "Job not found." };
    }
    if (!["verified", "invoiced", "paid", "closed"].includes(req.status as string)) {
      return { ok: false, error: "Review after the job is verified." };
    }
    const { data: wo } = await db
      .from("work_orders")
      .select("id, tradie_contact_id")
      .eq("request_id", req.id)
      .maybeSingle();
    if (!wo) return { ok: false, error: "Job not found." };
    const { error } = await db.from("job_reviews").insert({
      org_id: req.org_id,
      request_id: req.id,
      work_order_id: wo.id,
      tradie_contact_id: wo.tradie_contact_id,
      rating,
      comment: input.comment?.trim().slice(0, 500) || null,
      reviewer_role: row.scope === "tenant_intake" ? "occupant" : "payer",
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "This job already has a review." };
      return { ok: false, error: error.message };
    }
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: "review_submitted",
      actor_type: row.scope === "tenant_intake" ? "tenant" : "landlord",
      actor_id: `token:${row.id}`,
      payload: { rating },
    });
    return { ok: true };
  },

  async respondToReview(tradiePortalToken, reviewId, response) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    const { data: review } = await db
      .from("job_reviews")
      .select("id, org_id, tradie_contact_id, response")
      .eq("id", reviewId)
      .maybeSingle();
    if (!review || review.tradie_contact_id !== bizId) return { ok: false, error: "Review not found." };
    if (review.response) return { ok: false, error: "Already responded — one reply, on the record." };
    const text = response.trim().slice(0, 500);
    if (text.length < 2) return { ok: false, error: "Say something." };
    await db
      .from("job_reviews")
      .update({ response: text, responded_at: new Date().toISOString() })
      .eq("id", review.id);
    return { ok: true };
  },

  async fundJobNow(ownerToken, requestId) {
    const row = await resolveTokenAny(ownerToken, ["owner_portal"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: req } = await db
      .from("maintenance_requests")
      .select("id, org_id, property_id, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { ok: false, error: "Job not found." };
    const { data: prop } = await db.from("properties").select("owner_contact_id").eq("id", req.property_id).maybeSingle();
    if (prop?.owner_contact_id !== row.aggregate_id) return { ok: false, error: "Job not found." };
    return fundJobCore(db, req, `token:${row.id}`);
  },

  async getPerformance(token) {
    const row = await resolveTokenAny(token, ["tradie_portal", "pm_portfolio", "owner_portal"]);
    if (!row?.contact_id && row?.scope !== "owner_portal") return null;
    if (!row) return null;
    const db = serviceClient();
    if (row.scope === "tradie_portal") {
      return tradiePerformance(db, row.contact_id!);
    }
    const scope = row.scope === "pm_portfolio" ? ("pm" as const) : ("owner" as const);
    const { data: props } =
      scope === "pm"
        ? await db
            .from("properties")
            .select("id, address_line1, suburb, pm_contact_id, trust_balance_cents")
            .eq("pm_contact_id", row.contact_id)
        : await db
            .from("properties")
            .select("id, address_line1, suburb, pm_contact_id, trust_balance_cents")
            .eq("owner_contact_id", row.aggregate_id);
    return portfolioPerformance(db, scope, (props ?? []) as Array<{ id: string; address_line1: string; suburb: string; pm_contact_id: string | null; trust_balance_cents: number }>);
  },

  // ——— v8 R7: PM subscription + house tradies ———

  async getPmSubscription(pmPortfolioToken) {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const [{ data: sub }, { count }, options] = await Promise.all([
      db.from("pm_subscriptions").select("sku, name, price_cents, property_cap, selected_at").eq("pm_contact_id", resolved.contact_id).maybeSingle(),
      db.from("properties").select("id", { count: "exact", head: true }).eq("pm_contact_id", resolved.contact_id),
      listPmTiers(),
    ]);
    const pum = count ?? 0;
    const current = sub
      ? {
          sku: sub.sku as string,
          name: sub.name as string,
          priceCents: Number(sub.price_cents),
          propertyCap: Number(sub.property_cap),
          selectedAt: String(sub.selected_at),
        }
      : null;
    return {
      current,
      options: options.map((t) => ({ sku: t.sku, name: t.name, priceCents: t.priceCents, propertyCap: t.propertyCap })),
      propertiesUnderManagement: pum,
      overCap: Boolean(current && pum > current.propertyCap),
    };
  },

  async selectPmSubscription(pmPortfolioToken, sku) {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const tiers = await listPmTiers();
    const tier = tiers.find((t) => t.sku === sku);
    if (!tier) return { ok: false, error: "Unknown subscription tier." };
    const db = serviceClient();
    const { data: pm } = await db.from("contacts").select("org_id, full_name, email").eq("id", resolved.contact_id).maybeSingle();
    if (!pm) return { ok: false, error: "Manager not found." };
    const { count } = await db.from("properties").select("id", { count: "exact", head: true }).eq("pm_contact_id", resolved.contact_id);
    const pum = count ?? 0;
    // CRM mirror is best-effort; the row is truth.
    const { dealId } = await recordSubscriptionDeal({
      pmName: pm.full_name as string,
      pmEmail: (pm.email as string | null) ?? null,
      tier,
      propertiesUnderManagement: pum,
    });
    const { error } = await db.from("pm_subscriptions").upsert({
      pm_contact_id: resolved.contact_id,
      org_id: pm.org_id,
      sku: tier.sku,
      name: tier.name,
      price_cents: tier.priceCents,
      property_cap: tier.propertyCap,
      hubspot_product_id: tier.hubspotProductId,
      hubspot_deal_id: dealId,
      selected_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    await db.from("events").insert({
      org_id: pm.org_id,
      aggregate_type: "contact",
      aggregate_id: resolved.contact_id,
      event_type: "subscription_selected",
      actor_type: "agency_user",
      actor_id: `token:${resolved.id}`,
      payload: { sku: tier.sku, priceCents: tier.priceCents, propertyCap: tier.propertyCap, pum, hubspotDealId: dealId },
    });
    return { ok: true };
  },

  async getHouseTradies(pmPortfolioToken) {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const [{ data: rows }, { data: prefs }, { data: allTradies }, { data: presence }] = await Promise.all([
      db.from("pm_preferred_tradies").select("tradie_contact_id, priority").eq("pm_contact_id", resolved.contact_id).order("priority"),
      db.from("pm_dispatch_prefs").select("house_max_job_cents").eq("pm_contact_id", resolved.contact_id).maybeSingle(),
      db.from("contacts").select("id, full_name, employer_contact_id").eq("kind", "tradie"),
      db.from("tradie_presence").select("tradie_contact_id, online").eq("online", true),
    ]);
    const onlineSet = new Set(((presence ?? []) as Array<{ tradie_contact_id: string }>).map((r) => r.tradie_contact_id));
    const tradieRows = (allTradies ?? []) as Array<{ id: string; full_name: string; employer_contact_id: string | null }>;
    const businesses = tradieRows.filter((c) => !c.employer_contact_id);
    const nameOf = new Map(tradieRows.map((c) => [c.id, c.full_name]));
    return {
      tradies: ((rows ?? []) as Array<{ tradie_contact_id: string; priority: number }>).map((r) => ({
        contactId: r.tradie_contact_id,
        name: nameOf.get(r.tradie_contact_id) ?? "",
        online: onlineSet.has(r.tradie_contact_id) || tradieRows.some((c) => c.employer_contact_id === r.tradie_contact_id && onlineSet.has(c.id)),
        priority: r.priority,
      })),
      maxJobCents: prefs ? Number(prefs.house_max_job_cents) : 30_000,
      networkTradies: businesses.map((c) => ({ contactId: c.id, name: c.full_name })),
    };
  },

  async setHouseTradies(pmPortfolioToken, input) {
    const resolved = await resolveToken(pmPortfolioToken, "pm_portfolio");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const ids = [...new Set(input.tradieContactIds)].slice(0, 3);
    const db = serviceClient();
    const { data: pm } = await db.from("contacts").select("org_id").eq("id", resolved.contact_id).maybeSingle();
    if (!pm) return { ok: false, error: "Manager not found." };
    if (ids.length > 0) {
      const { data: valid } = await db.from("contacts").select("id").in("id", ids).eq("kind", "tradie");
      if ((valid ?? []).length !== ids.length) return { ok: false, error: "Pick tradies from the network." };
    }
    await db.from("pm_preferred_tradies").delete().eq("pm_contact_id", resolved.contact_id);
    for (let i = 0; i < ids.length; i++) {
      await db.from("pm_preferred_tradies").insert({
        pm_contact_id: resolved.contact_id,
        tradie_contact_id: ids[i],
        org_id: pm.org_id,
        priority: i + 1,
      });
    }
    const maxJobCents = Math.max(0, Math.min(500_000, Math.round(input.maxJobCents)));
    await db.from("pm_dispatch_prefs").upsert({
      pm_contact_id: resolved.contact_id,
      org_id: pm.org_id,
      house_max_job_cents: maxJobCents,
    });
    await db.from("events").insert({
      org_id: pm.org_id,
      aggregate_type: "contact",
      aggregate_id: resolved.contact_id,
      event_type: "house_tradies_set",
      actor_type: "agency_user",
      actor_id: `token:${resolved.id}`,
      payload: { tradieContactIds: ids, maxJobCents },
    });
    return { ok: true };
  },

  // ——— v8 R5b: crews ———

  async listCrew(tradiePortalToken) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return null;
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    if (bizId !== resolved.contact_id) return []; // staff don't manage the crew
    const { data: staff } = await db
      .from("contacts")
      .select("id, full_name")
      .eq("employer_contact_id", bizId);
    const staffRows = (staff ?? []) as Array<{ id: string; full_name: string }>;
    if (staffRows.length === 0) return [];
    const { data: presence } = await db
      .from("tradie_presence")
      .select("tradie_contact_id, online")
      .in("tradie_contact_id", staffRows.map((c) => c.id));
    const onlineSet = new Set(
      ((presence ?? []) as Array<{ tradie_contact_id: string; online: boolean }>)
        .filter((pr) => pr.online)
        .map((pr) => pr.tradie_contact_id),
    );
    return staffRows.map((c) => ({ contactId: c.id, name: c.full_name, online: onlineSet.has(c.id) }));
  },

  async addCrewMember(tradiePortalToken, input) {
    const resolved = await resolveToken(tradiePortalToken, "tradie_portal");
    if (!resolved?.contact_id) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const bizId = await tradieBusinessId(db, resolved.contact_id);
    if (bizId !== resolved.contact_id) return { ok: false, error: "Only the business seat manages the crew." };
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) return { ok: false, error: "A name, please." };
    const { data: biz } = await db.from("contacts").select("org_id").eq("id", bizId).maybeSingle();
    if (!biz) return { ok: false, error: "Business not found." };
    const { data: staff, error } = await db
      .from("contacts")
      .insert({
        org_id: biz.org_id,
        kind: "tradie",
        full_name: name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        employer_contact_id: bizId,
      })
      .select("id")
      .single();
    if (error || !staff) return { ok: false, error: error?.message ?? "Could not add them." };
    await db.from("tradie_presence").upsert({ tradie_contact_id: staff.id, org_id: biz.org_id, online: false });
    const issued = issueToken("tradie_portal");
    const { error: tError } = await db.from("access_tokens").insert({
      org_id: biz.org_id,
      token_hash: issued.tokenHash,
      scope: "tradie_portal",
      aggregate_id: staff.id,
      contact_id: staff.id,
      expires_at: issued.expiresAt.toISOString(),
    });
    if (tError) return { ok: false, error: tError.message };
    await db.from("events").insert({
      org_id: biz.org_id,
      aggregate_type: "contact",
      aggregate_id: bizId,
      event_type: "crew_member_added",
      actor_type: "tradie",
      actor_id: `token:${resolved.id}`,
      payload: { staffContactId: staff.id, name },
    });
    return { ok: true, path: `/p/trade/${issued.token}` };
  },

  async attachAssetReceipt(ownerToken, assetId, input) {
    const row = await resolveTokenAny(ownerToken, ["owner_portal", "pm_portfolio"]);
    if (!row) return { ok: false, error: "This link isn't active." };
    const db = serviceClient();
    const { data: asset } = await db
      .from("property_assets")
      .select("id, org_id, property_id")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset) return { ok: false, error: "Asset not found." };
    const { data: prop } = await db
      .from("properties")
      .select("owner_contact_id, pm_contact_id")
      .eq("id", asset.property_id)
      .maybeSingle();
    const allowed =
      (row.scope === "owner_portal" && prop?.owner_contact_id === row.aggregate_id) ||
      (row.scope === "pm_portfolio" && prop?.pm_contact_id === row.contact_id);
    if (!allowed) return { ok: false, error: "Asset not found." };
    if (!input.dataUrl?.startsWith("data:")) return { ok: false, error: "Attach the receipt photo or PDF scan." };
    const months = Math.max(0, Math.min(240, Math.round(input.warrantyMonths)));
    const { error } = await db
      .from("property_assets")
      .update({
        receipt_data_url: input.dataUrl,
        purchased_at: input.purchasedAt || null,
        manufacturer_warranty_months: months || null,
      })
      .eq("id", asset.id);
    if (error) return { ok: false, error: error.message };
    await db.from("events").insert({
      org_id: asset.org_id,
      aggregate_type: "property",
      aggregate_id: asset.property_id,
      event_type: "receipt_attached",
      actor_type: row.scope === "owner_portal" ? "landlord" : "agency_user",
      actor_id: `token:${row.id}`,
      payload: { assetId: asset.id, purchasedAt: input.purchasedAt, warrantyMonths: months },
    });
    return { ok: true };
  },
};

/** An approved (or auto-applied) scope increase becomes a variance payment
 * slice: authorized now, captured with everything else on verify. A negative
 * delta (scope shrank) voids value by reducing what verify settles — recorded
 * as a zero-floor guard here; the honest path for refunds is R4. */
async function applyVarianceSlice(
  db: ReturnType<typeof serviceClient>,
  requestId: string,
  orgId: string,
  deltaCents: number,
): Promise<void> {
  if (deltaCents <= 0) return;
  const psp = resolvePsp();
  const { data: primary } = await db
    .from("payments")
    .select("id, psp_ref")
    .eq("request_id", requestId)
    .in("kind", ["primary", "balance"])
    .eq("status", "authorized")
    .limit(1)
    .maybeSingle();
  let pspRef: string | null = null;
  if (primary?.psp_ref) {
    // Prefer raising the existing hold (Stripe increment_authorization).
    const inc = await psp.incrementAuthorization(primary.psp_ref, deltaCents);
    if (inc.ok) pspRef = primary.psp_ref;
  }
  if (!pspRef) {
    const auth = await psp.authorize({ amountCents: deltaCents, requestId, description: `1Pacent variance ${requestId}` });
    pspRef = auth.pspRef ?? null;
  }
  await db.from("payments").insert({
    org_id: orgId,
    request_id: requestId,
    status: "authorized",
    amount_cents: deltaCents,
    platform_fee_cents: splitPayment(deltaCents).platformFeeCents,
    kind: "variance",
    psp: psp.name,
    psp_ref: pspRef,
  });
}

/** The payer's variance decision — shared by the in-app tap and the one-tap
 * moment token. Approve → the hold rises and work resumes; decline → the job
 * continues at the booked scope, on the record. */
async function decideVarianceCore(
  db: ReturnType<typeof serviceClient>,
  varianceId: string,
  decision: "approve" | "decline",
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: v } = await db
    .from("variances")
    .select("id, org_id, request_id, work_order_id, booked_cents, new_total_cents, status")
    .eq("id", varianceId)
    .maybeSingle();
  if (!v) return { ok: false, error: "Not found." };
  if (v.status !== "pending") return { ok: false, error: "This change was already decided." };
  const { data: updated } = await db
    .from("variances")
    .update({ status: decision === "approve" ? "approved" : "declined", decided_at: new Date().toISOString() })
    .eq("id", v.id)
    .eq("status", "pending")
    .select("id");
  if (!updated || updated.length === 0) return { ok: false, error: "This change was already decided." };
  await db.from("events").insert({
    org_id: v.org_id,
    aggregate_type: "work_order",
    aggregate_id: v.work_order_id,
    event_type: decision === "approve" ? "variance_approved" : "variance_declined",
    actor_type: "landlord",
    actor_id: actorId,
    payload: { bookedCents: Number(v.booked_cents), newTotalCents: Number(v.new_total_cents) },
  });
  // Parts riding this variance follow the decision.
  await db
    .from("job_parts")
    .update({ status: decision === "approve" ? "active" : "declined" })
    .eq("variance_id", v.id);
  if (decision === "approve") {
    await applyVarianceSlice(db, v.request_id, v.org_id, Number(v.new_total_cents) - Number(v.booked_cents));
  }
  return { ok: true };
}

/** One money line from N payment slices (v8 R3: milestone playbooks carry
 * deposit + balance rows). Sum the amounts; report the least-settled status
 * so "authorized" never reads as "paid". */
function aggregatePayments(
  rows: Array<{ status: string; amount_cents: number }>,
): { status: PaymentState; amountCents: number; payoutCents: number | null } | null {
  const live = rows.filter((r) => r.status !== "voided");
  if (live.length === 0) return null;
  const amountCents = live.reduce((sum, r) => sum + Number(r.amount_cents), 0);
  const rank: Record<string, number> = { authorized: 0, disputed: 0, captured: 1, transferred: 2 };
  const status = live.reduce<PaymentState>(
    (least, r) => ((rank[r.status] ?? 0) < (rank[least] ?? 0) ? (r.status as PaymentState) : least),
    live[0]!.status as PaymentState,
  );
  return { status, amountCents, payoutCents: splitPayment(amountCents).tradiePayoutCents };
}

/** The Autopilot sliders write exactly one rule per property at this priority —
 * distinct from any hand-crafted dashboard rules (which sort after it). */
const AUTOPILOT_RULE_PRIORITY = -100;

/** Safety switch: work in these categories always comes to a human, whatever
 * the sliders say. Gas, electrical danger, and life-safety devices. */
const AUTOPILOT_SAFETY_CATEGORIES: RequestCategory[] = [
  "gas_leak",
  "dangerous_electrical_fault",
  "safety_device_fault_smoke_alarm_or_pool_barrier",
];

/** George layer 3 (opt-in): read the tradie's external calendar busy windows
 * for today. No grant (or any API failure) → empty — the ledger plans alone. */
async function calendarBusyWindows(
  db: ReturnType<typeof serviceClient>,
  tradieContactId: string,
): Promise<Array<{ startAt: string; endAt: string }>> {
  const { data: cal } = await db
    .from("tradie_calendar")
    .select("access_token, read_busy, provider")
    .eq("tradie_contact_id", tradieContactId)
    .maybeSingle();
  if (!cal?.access_token || !cal.read_busy || cal.provider !== "google") return [];
  try {
    const dayStart = new Date();
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cal.access_token}` },
      body: JSON.stringify({
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: "primary" }],
      }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
    };
    return (body.calendars?.primary?.busy ?? []).map((b) => ({ startAt: b.start, endAt: b.end }));
  } catch {
    return [];
  }
}

/** The tradie BUSINESS's performance page (v8 R6). */
async function tradiePerformance(db: ReturnType<typeof serviceClient>, contactId: string) {
  const bizId = await tradieBusinessId(db, contactId);
  const { data: wos } = await db
    .from("work_orders")
    .select(
      "id, status, quote_cents, call_out_fee_cents, invoice_cents, invoiced_at, on_the_way_at, actual_minutes, estimated_minutes, warranty_expires_at, assigned_staff_contact_id, created_at, maintenance_requests!work_orders_request_id_fkey(id, title, status, properties(address_line1, suburb))",
    )
    .eq("tradie_contact_id", bizId)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (wos ?? []) as unknown as Array<{
    id: string;
    status: string;
    quote_cents: number | null;
    call_out_fee_cents: number | null;
    invoice_cents: number | null;
    invoiced_at: string | null;
    on_the_way_at: string | null;
    actual_minutes: number | null;
    estimated_minutes: number | null;
    warranty_expires_at: string | null;
    assigned_staff_contact_id: string | null;
    created_at: string;
    maintenance_requests:
      | { id: string; title: string; status: string; properties: { address_line1: string; suburb: string } | { address_line1: string; suburb: string }[] | null }
      | null;
  }>;
  const reqOf = (w: (typeof rows)[number]) => (Array.isArray(w.maintenance_requests) ? w.maintenance_requests[0] : w.maintenance_requests);
  const staffIds = [...new Set(rows.map((w) => w.assigned_staff_contact_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staff } = await db.from("contacts").select("id, full_name").in("id", staffIds);
    for (const c of (staff ?? []) as Array<{ id: string; full_name: string }>) names.set(c.id, c.full_name);
  }
  const bizName = (await contactName(db, bizId)) ?? "You";

  const byStatus = new Map<string, number>();
  let quoted = 0, invoiced = 0;
  const activity: Array<{ at: string; who: string; what: string; job: string }> = [];
  const warranties: Array<{ assetLabel: string; until: string; property: string | null }> = [];
  for (const w of rows) {
    const req = reqOf(w);
    const state = (req?.status ?? w.status) as string;
    byStatus.set(state, (byStatus.get(state) ?? 0) + 1);
    quoted += Number(w.quote_cents ?? 0) + Number(w.call_out_fee_cents ?? 0);
    invoiced += Number(w.invoice_cents ?? 0);
    const who = (w.assigned_staff_contact_id && names.get(w.assigned_staff_contact_id)) || bizName;
    const prop = req ? (Array.isArray(req.properties) ? req.properties[0] : req.properties) : null;
    const job = `${req?.title ?? "Job"}${prop ? ` @ ${prop.suburb}` : ""}`;
    if (w.invoiced_at) {
      activity.push({
        at: w.invoiced_at,
        who,
        what: w.actual_minutes ? `finished (on site ${w.actual_minutes} min${w.estimated_minutes ? ` / est ${w.estimated_minutes}` : ""})` : "finished",
        job,
      });
    } else if (w.on_the_way_at) activity.push({ at: w.on_the_way_at, who, what: "on the way", job });
    else activity.push({ at: w.created_at, who, what: state.replace(/_/g, " "), job });
    if (w.warranty_expires_at && new Date(w.warranty_expires_at) > new Date()) {
      warranties.push({ assetLabel: job, until: w.warranty_expires_at, property: prop ? `${prop.address_line1}, ${prop.suburb}` : null });
    }
  }
  const woIds = rows.map((w) => w.id);
  let partsUsed: Array<{ label: string; costCents: number | null; job: string; at: string }> = [];
  if (woIds.length > 0) {
    const { data: parts } = await db
      .from("job_parts")
      .select("label, cost_cents, status, created_at, work_order_id")
      .in("work_order_id", woIds)
      .order("created_at", { ascending: false })
      .limit(30);
    partsUsed = ((parts ?? []) as Array<{ label: string; cost_cents: number; status: string; created_at: string; work_order_id: string }>)
      .filter((pt) => pt.status === "active")
      .map((pt) => {
        const w = rows.find((x) => x.id === pt.work_order_id);
        const req = w ? reqOf(w) : null;
        return { label: pt.label, costCents: Number(pt.cost_cents), job: req?.title ?? "Job", at: pt.created_at };
      });
  }
  const { data: payRows } = await db.from("payments").select("request_id, amount_cents, status");
  const reqIds = new Set(rows.map((w) => reqOf(w)?.id).filter(Boolean));
  let collected = 0, awaiting = 0;
  for (const pm of (payRows ?? []) as Array<{ request_id: string; amount_cents: number; status: string }>) {
    if (!reqIds.has(pm.request_id)) continue;
    if (pm.status === "transferred") collected += Number(pm.amount_cents);
    if (pm.status === "captured") awaiting += Number(pm.amount_cents);
  }
  const { data: reviewRows } = await db
    .from("job_reviews")
    .select("id, rating, comment, reviewer_role, response, created_at, maintenance_requests!job_reviews_request_id_fkey(title)")
    .eq("tradie_contact_id", bizId)
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews = ((reviewRows ?? []) as unknown as Array<{
    id: string; rating: number; comment: string | null; reviewer_role: string; response: string | null; created_at: string;
    maintenance_requests: { title: string } | { title: string }[] | null;
  }>).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    reviewerRole: r.reviewer_role as "occupant" | "payer",
    at: r.created_at,
    response: r.response,
    jobTitle: (Array.isArray(r.maintenance_requests) ? r.maintenance_requests[0]?.title : r.maintenance_requests?.title) ?? "Job",
  }));
  const avgRating = reviews.length > 0 ? reviews.reduce((sm, r) => sm + r.rating, 0) / reviews.length : null;
  const acc = await supabaseData.getTradieAccuracy(""); // not token-callable here; compute inline below
  void acc;
  // accuracy inline (same fairness as getTradieAccuracy, business-level)
  const priced = rows.filter((w) => w.invoice_cents !== null && (w.quote_cents ?? 0) > 0);
  const moneyVars: number[] = [];
  for (const w of priced) {
    // playbook exclusion is already applied at score level in getTradieAccuracy;
    // performance shows the raw pipeline, score uses the fair inputs below.
    moneyVars.push(Math.abs(Number(w.invoice_cents) - Number(w.quote_cents)) / Number(w.quote_cents));
  }
  const timedRows = rows.filter((w) => w.actual_minutes != null && (w.estimated_minutes ?? 0) > 0);
  const timeVars = timedRows.map((w) => computeTimeAccuracy(Number(w.estimated_minutes), Number(w.actual_minutes!)).absVariancePct);
  const avgMoney = moneyVars.length ? (moneyVars.reduce((x, y) => x + y, 0) / moneyVars.length) * 100 : null;
  const avgTime = timeVars.length ? timeVars.reduce((x, y) => x + y, 0) / timeVars.length : null;
  const completedJobs = priced.length;
  const scoreValue = scoreTrustWithFeedback(
    { completedJobs, avgAbsVariancePct: blendedAccuracyPct(avgMoney, avgTime) },
    { avgRating, reviewCount: reviews.length },
  );
  const openCount = [...byStatus.entries()].filter(([st]) => !["paid", "closed", "cancelled", "declined"].includes(st)).reduce((sm, [, c]) => sm + c, 0);
  return {
    scope: "tradie" as const,
    heading: `${bizName} — business performance`,
    tiles: [
      { label: "Jobs on the books", value: String(rows.length), hint: `${openCount} live` },
      { label: "Collected", value: `$${Math.round(collected / 100).toLocaleString("en-AU")}` },
      { label: "Trust score", value: String(scoreValue), hint: avgRating ? `★ ${avgRating.toFixed(1)} (${reviews.length})` : "no reviews yet" },
      { label: "Warranty obligations", value: String(warranties.length), hint: "live workmanship promises" },
    ],
    jobsByStatus: [...byStatus.entries()].map(([state, count]) => ({ state: state as RequestState, count })),
    activity: activity.sort((x, y) => Date.parse(y.at) - Date.parse(x.at)).slice(0, 20),
    partsUsed,
    warranties,
    money: { quotedCents: quoted, invoicedCents: invoiced, collectedCents: collected, awaitingFundsCents: awaiting },
    score: {
      value: scoreValue,
      avgAbsMoneyVariancePct: avgMoney,
      avgAbsTimeVariancePct: avgTime,
      avgRating,
      reviewCount: reviews.length,
      tips: scoreTips({ avgAbsMoneyVariancePct: avgMoney, avgAbsTimeVariancePct: avgTime, avgRating, completedJobs }),
    },
    reviews,
    perProperty: null,
  };
}

/** PM portfolio / owner performance — same shape, property-drilled. */
async function portfolioPerformance(
  db: ReturnType<typeof serviceClient>,
  scope: "pm" | "owner",
  props: Array<{ id: string; address_line1: string; suburb: string; pm_contact_id: string | null; trust_balance_cents: number }>,
) {
  const propertyIds = props.map((pp) => pp.id);
  const { data: reqs } = propertyIds.length
    ? await db
        .from("maintenance_requests")
        .select("id, title, status, property_id, reported_at")
        .in("property_id", propertyIds)
        .order("reported_at", { ascending: false })
        .limit(300)
    : { data: [] };
  const reqRows = (reqs ?? []) as Array<{ id: string; title: string; status: string; property_id: string; reported_at: string }>;
  const { data: pays } = await db.from("payments").select("request_id, amount_cents, status");
  const payRows = (pays ?? []) as Array<{ request_id: string; amount_cents: number; status: string }>;
  const reqIdSet = new Set(reqRows.map((r) => r.id));
  let collected = 0, awaiting = 0, invoicedTotal = 0;
  for (const pm of payRows) {
    if (!reqIdSet.has(pm.request_id)) continue;
    if (pm.status === "transferred") collected += Number(pm.amount_cents);
    if (pm.status === "captured") awaiting += Number(pm.amount_cents);
  }
  const byStatus = new Map<string, number>();
  const OPEN = new Set(["reported", "triaged", "pending_approval", "approved", "quoting", "scheduled", "in_progress", "evidence_pending"]);
  const activity: Array<{ at: string; who: string; what: string; job: string }> = [];
  const addrOf = new Map(props.map((pp) => [pp.id, `${pp.address_line1}, ${pp.suburb}`]));
  for (const r of reqRows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    if (activity.length < 20) {
      activity.push({ at: r.reported_at, who: addrOf.get(r.property_id) ?? "", what: r.status.replace(/_/g, " "), job: r.title });
    }
  }
  const { data: woRows } = propertyIds.length
    ? await db
        .from("work_orders")
        .select("invoice_cents, warranty_expires_at, request_id, contacts(full_name)")
        .not("invoice_cents", "is", null)
    : { data: [] };
  const warranties: Array<{ assetLabel: string; until: string; property: string | null }> = [];
  for (const w of (woRows ?? []) as Array<{ invoice_cents: number | null; warranty_expires_at: string | null; request_id: string; contacts: { full_name: string } | { full_name: string }[] | null }>) {
    if (!reqIdSet.has(w.request_id)) continue;
    invoicedTotal += Number(w.invoice_cents ?? 0);
    if (w.warranty_expires_at && new Date(w.warranty_expires_at) > new Date()) {
      const req = reqRows.find((r) => r.id === w.request_id);
      const tradie = Array.isArray(w.contacts) ? w.contacts[0] : w.contacts;
      warranties.push({
        assetLabel: `${req?.title ?? "Job"}${tradie ? ` — ${tradie.full_name}` : ""}`,
        until: w.warranty_expires_at,
        property: req ? (addrOf.get(req.property_id) ?? null) : null,
      });
    }
  }
  const perProperty = [] as NonNullable<PerformanceView["perProperty"]>;
  for (const pp of props) {
    const propReqs = reqRows.filter((r) => r.property_id === pp.id);
    const spend = await spendingForProperties(db, [pp.id], 12);
    const detail = await supabaseData.getProperty(pp.id);
    perProperty.push({
      propertyId: pp.id,
      address: `${pp.address_line1}, ${pp.suburb}`,
      openJobs: propReqs.filter((r) => OPEN.has(r.status)).length,
      spend12moCents: spend.totalCents,
      warranties: warranties.filter((w) => w.property === `${pp.address_line1}, ${pp.suburb}`).length,
      compliance: detail?.compliance.overall ?? "amber",
      trustBalanceCents: scope === "pm" ? Number(pp.trust_balance_cents) : null,
    });
  }
  return {
    scope,
    heading: scope === "pm" ? "Portfolio performance" : "Your properties — performance",
    tiles: [
      { label: "Properties", value: String(props.length) },
      { label: "Open jobs", value: String(reqRows.filter((r) => OPEN.has(r.status)).length) },
      { label: "Maintained (12mo)", value: `$${Math.round(perProperty.reduce((sm, x) => sm + x.spend12moCents, 0) / 100).toLocaleString("en-AU")}` },
      {
        label: "Awaiting funds",
        value: `$${Math.round(awaiting / 100).toLocaleString("en-AU")}`,
        hint: awaiting > 0 ? "trust short — owner can pay now" : "all settled same-day",
      },
    ],
    jobsByStatus: [...byStatus.entries()].map(([state, count]) => ({ state: state as RequestState, count })),
    activity,
    partsUsed: [],
    warranties,
    money: { quotedCents: 0, invoicedCents: invoicedTotal, collectedCents: collected, awaitingFundsCents: awaiting },
    score: null,
    reviews: [],
    perProperty,
  };
}

interface VerifiableRequestRow {
  id: string;
  org_id: string;
  property_id: string;
  status: string;
  playbook_key: string | null;
}

/**
 * The human verification + Penny's settlement, shared by the Job Screen's
 * verify tap and the lock-screen one-tap moment action. Callers have already
 * proven the actor may see this request; this records the human actor and
 * runs capture → transfer (simulated PSP) → the Address Record write.
 */
async function verifySettleCore(
  db: ReturnType<typeof serviceClient>,
  req: VerifiableRequestRow,
  actor: { actorType: ActorType; actorId: string },
): Promise<{ ok: boolean; error?: string; funding?: "payer_card" | "pm_trust" | "owner_handoff" }> {
  const verifyResult = transition(req.status as RequestState, "verify", actor.actorType);
  if (!verifyResult.ok) return { ok: false, error: `Cannot verify from state "${req.status}".` };
  const base = { org_id: req.org_id, aggregate_type: "maintenance_request", aggregate_id: req.id };
  await db.from("events").insert({
    ...base,
    event_type: "verify",
    actor_type: actor.actorType,
    actor_id: actor.actorId,
  });
  await db.from("maintenance_requests").update({ status: verifyResult.state }).eq("id", req.id);

  const { data: wo } = await db
    .from("work_orders")
    .select(
      "id, tradie_contact_id, quote_cents, call_out_fee_cents, asset_manufacturer, asset_model, asset_serial, receipt_data_url, asset_purchased_at, asset_warranty_months",
    )
    .eq("request_id", req.id)
    .maybeSingle();
  if (!wo) return { ok: true };
  await db.from("work_orders").update({ status: verifyResult.state }).eq("id", wo.id);

  // Settlement: capture + transfer through the PSP seam, the record write,
  // the certificate if this was a compliance playbook — Penny's whole job.
  const playbook = req.playbook_key ? getPlaybook(req.playbook_key) : null;
  const { data: paymentRows } = await db
    .from("payments")
    .select("id, amount_cents, status, kind, psp, psp_ref")
    .eq("request_id", req.id);
  const openSlices = ((paymentRows ?? []) as Array<{
    id: string;
    amount_cents: number;
    status: string;
    kind: string;
    psp: string;
    psp_ref: string | null;
  }>).filter((p) => p.status !== "voided");
  const { data: partRows } = await db
    .from("job_parts")
    .select("cost_cents, status")
    .eq("work_order_id", wo.id);
  const activePartsCents = ((partRows ?? []) as Array<{ cost_cents: number; status: string }>)
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + Number(p.cost_cents), 0);
  const settleAmount =
    openSlices.length > 0
      ? openSlices.reduce((sum, p) => sum + Number(p.amount_cents), 0)
      : Number(wo.quote_cents ?? 0) + Number(wo.call_out_fee_cents ?? 0) + activePartsCents;

  const invoiceResult = transition(verifyResult.state, "invoice", "system");
  if (!invoiceResult.ok) return { ok: true };
  await db.from("events").insert({
    ...base,
    event_type: "invoice",
    actor_type: "system",
    actor_id: "penny:capture",
    payload: { note: `Fixed price captured on verification — ${(settleAmount / 100).toFixed(2)}` },
  });

  let assetId: string | null = null;
  if (playbook) {
    const identity = {
      ...(wo.asset_manufacturer ? { manufacturer: wo.asset_manufacturer } : {}),
      ...(wo.asset_model ? { model: wo.asset_model } : {}),
      ...(wo.asset_serial ? { serial_number: wo.asset_serial } : {}),
    };
    const { data: existingAsset } = await db
      .from("property_assets")
      .select("id")
      .eq("property_id", req.property_id)
      .eq("category", playbook.category)
      .eq("label", playbook.assetLabel)
      .maybeSingle();
    if (wo.receipt_data_url) {
      // The tradie bought the unit: their receipt establishes the
      // manufacturer warranty. Never overwrites a receipt already on file.
      Object.assign(identity, {
        receipt_data_url: wo.receipt_data_url,
        purchased_at: wo.asset_purchased_at,
        manufacturer_warranty_months: wo.asset_warranty_months,
      });
    }
    if (existingAsset) {
      assetId = existingAsset.id;
      // The id-plate truth the tradie recorded on site lands on the record.
      const { data: current } = await db
        .from("property_assets")
        .select("receipt_data_url")
        .eq("id", assetId)
        .maybeSingle();
      const patch: Record<string, unknown> = { ...identity };
      if (current?.receipt_data_url) {
        delete patch.receipt_data_url;
        delete patch.purchased_at;
        delete patch.manufacturer_warranty_months;
      }
      if (Object.keys(patch).length > 0) await db.from("property_assets").update(patch).eq("id", assetId);
    } else {
      const { data: created } = await db
        .from("property_assets")
        .insert({ org_id: req.org_id, property_id: req.property_id, category: playbook.category, label: playbook.assetLabel, ...identity })
        .select("id")
        .single();
      assetId = created?.id ?? null;
    }
    if (playbook.compliance) {
      await db.from("compliance_certificates").insert({
        org_id: req.org_id,
        property_id: req.property_id,
        requirement_key: playbook.compliance.filesCertificate,
        completed_at: new Date().toISOString().slice(0, 10),
        uploaded_by: "system:playbook-completion",
      });
    }
  }
  await db
    .from("work_orders")
    .update({
      invoice_cents: settleAmount,
      invoiced_at: new Date().toISOString(),
      asset_id: assetId,
      warranty_expires_at:
        playbook && playbook.warrantyDefaultMonths > 0
          ? new Date(Date.now() + playbook.warrantyDefaultMonths * 30 * 86_400_000).toISOString()
          : null,
    })
    .eq("id", wo.id);

  let fundingOutcome: "payer_card" | "pm_trust" | "owner_handoff" | null = null;
  if (openSlices.length > 0) {
    const psp = resolvePsp();
    const fastPay = await tradieFastPayEnabled(db, wo.tradie_contact_id as string | null);
    const split = splitPaymentWithFastPay(settleAmount, fastPay);
    // The same-day funding ladder (v8 R6): who pays NOW is decided
    // deterministically — owner-occupier card, PM trust balance, or a
    // hand-off to the owner when rent hasn't landed.
    const { data: fundProp } = await db
      .from("properties")
      .select("id, pm_contact_id, trust_balance_cents")
      .eq("id", req.property_id)
      .maybeSingle();
    const funding = decideFunding({
      pmManaged: Boolean(fundProp?.pm_contact_id),
      trustBalanceCents: fundProp?.trust_balance_cents != null ? Number(fundProp.trust_balance_cents) : null,
      amountCents: settleAmount,
    });
    fundingOutcome = funding.source === "awaiting_funds" ? "owner_handoff" : funding.source;
    const transferNow = funding.source !== "owner_handoff";
    for (const slice of openSlices) {
      if (slice.status !== "authorized") continue; // deposit already settled at confirmation
      if (slice.psp_ref) {
        const captured = await psp.capture(slice.psp_ref);
        if (!captured.ok) {
          // The verification stands; money truth lands via webhook/retry —
          // the ledger records the miss instead of pretending.
          console.warn(`[penny] capture failed for ${slice.id}:`, captured.error);
          continue;
        }
      }
      const transferred = transferNow
        ? slice.psp_ref
          ? await psp.transfer({ amountCents: Number(slice.amount_cents), description: `1Pacent job ${req.id}`, destination: null })
          : { ok: psp.name === "simulated" }
        : { ok: false };
      await db
        .from("payments")
        .update({
          status: transferNow && (transferred.ok || psp.name === "simulated") ? "transferred" : "captured",
          work_order_id: wo.id,
          fastpay_fee_cents: fastPay ? split.fastPayFeeCents : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", slice.id);
    }
    if (funding.source === "pm_trust" && fundProp) {
      await db
        .from("properties")
        .update({ trust_balance_cents: funding.trustBalanceAfterCents })
        .eq("id", fundProp.id);
    }
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: funding.source === "owner_handoff" ? "funding_handoff" : "funding_decided",
      actor_type: "system",
      actor_id: "penny:funding",
      payload: { source: funding.source, note: funding.note, amountCents: settleAmount },
    });
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "work_order",
      aggregate_id: wo.id,
      event_type: "payment_transferred",
      actor_type: "system",
      actor_id: "penny:psp",
      payload: {
        amountCents: settleAmount,
        psp: psp.name,
        platformFeeCents: split.platformFeeCents,
        fastPay,
        fastPayFeeCents: split.fastPayFeeCents,
        tradiePayoutCents: split.tradiePayoutCents,
      },
    });
  }

  // A handed-off job stops at "invoiced" — record_payment/close land when
  // the owner funds it (fundJobCore) or the month-end run does.
  if (fundingOutcome === "owner_handoff") return { ok: true, funding: "owner_handoff" as const };
  const paidResult = transition(invoiceResult.state, "record_payment", "system");
  const closedResult = paidResult.ok ? transition(paidResult.state, "close", "system") : null;
  const trailing: Array<Record<string, unknown>> = [];
  if (paidResult.ok) trailing.push({ ...base, event_type: "record_payment", actor_type: "system", actor_id: "penny:psp" });
  if (closedResult?.ok) trailing.push({ ...base, event_type: "close", actor_type: "system", actor_id: "penny:psp" });
  if (trailing.length > 0) await db.from("events").insert(trailing);
  const finalState = closedResult?.ok ? closedResult.state : invoiceResult.state;
  await db.from("maintenance_requests").update({ status: finalState }).eq("id", req.id);
  await db.from("work_orders").update({ status: finalState }).eq("id", wo.id);
  return { ok: true, funding: fundingOutcome ?? undefined };
}

/** The owner pays a trust-short job NOW (simulated card): captured slices
 * transfer, the state machine finishes, funded_by_owner hits the ledger. */
async function fundJobCore(
  db: ReturnType<typeof serviceClient>,
  req: { id: string; org_id: string; status: string },
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: slices } = await db
    .from("payments")
    .select("id, amount_cents, status")
    .eq("request_id", req.id)
    .eq("status", "captured");
  const rows = (slices ?? []) as Array<{ id: string; amount_cents: number }>;
  if (rows.length === 0) return { ok: false, error: "Nothing awaiting funding on this job." };
  for (const slice of rows) {
    await db.from("payments").update({ status: "transferred", updated_at: new Date().toISOString() }).eq("id", slice.id);
  }
  const total = rows.reduce((sum, r) => sum + Number(r.amount_cents), 0);
  const { data: wo } = await db.from("work_orders").select("id").eq("request_id", req.id).maybeSingle();
  await db.from("events").insert({
    org_id: req.org_id,
    aggregate_type: "work_order",
    aggregate_id: wo?.id ?? req.id,
    event_type: "funded_by_owner",
    actor_type: "landlord",
    actor_id: actorId,
    payload: { amountCents: total, note: "Owner paid now — tradie same-day; PM trust untouched." },
  });
  const base = { org_id: req.org_id, aggregate_type: "maintenance_request", aggregate_id: req.id };
  const paid = transition(req.status as RequestState, "record_payment", "system");
  if (paid.ok) {
    await db.from("events").insert({ ...base, event_type: "record_payment", actor_type: "system", actor_id: "penny:psp" });
    const closed = transition(paid.state, "close", "system");
    const finalState = closed.ok ? closed.state : paid.state;
    if (closed.ok) await db.from("events").insert({ ...base, event_type: "close", actor_type: "system", actor_id: "penny:psp" });
    await db.from("maintenance_requests").update({ status: finalState }).eq("id", req.id);
    if (wo) await db.from("work_orders").update({ status: finalState }).eq("id", wo.id);
  }
  return { ok: true };
}

interface ContactJoin {
  full_name: string;
  email: string | null;
}

interface QuoteJoinRow {
  id: string;
  tradie_contact_id: string;
  status: string;
  quote_cents: number | null;
  call_out_fee_cents: number | null;
  note?: string | null;
  created_at?: string;
  submitted_at?: string | null;
  contacts: ContactJoin | ContactJoin[] | null;
}

function normalizeContact(joined: ContactJoin | ContactJoin[] | null): ContactJoin | null {
  if (!joined) return null;
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

function toQuoteSummary(row: QuoteJoinRow): QuoteSummary {
  const contact = normalizeContact(row.contacts);
  let respondedWithinMinutes: number | null = null;
  if (row.created_at && row.submitted_at) {
    respondedWithinMinutes = (new Date(row.submitted_at).getTime() - new Date(row.created_at).getTime()) / 60_000;
  }
  return {
    quoteId: row.id,
    tradieContactId: row.tradie_contact_id,
    tradieName: contact?.full_name ?? "Unknown",
    tradieEmail: contact?.email ?? "",
    status: row.status,
    quoteCents: row.quote_cents,
    callOutFeeCents: row.call_out_fee_cents,
    note: row.note ?? null,
    respondedWithinMinutes,
  };
}

/** Shared by the landlord's manual accept click and the approval-policy
 * auto-accept path — same sequence, different actor. */
async function acceptQuoteTx(
  db: ReturnType<typeof serviceClient>,
  req: { id: string; org_id: string; status: string },
  quoteId: string,
  actorType: ActorType,
  actorId: string,
): Promise<AcceptQuoteResult> {
  const current = req.status as RequestState;
  const result = transition(current, "accept_quote", actorType);
  if (!result.ok) return { ok: false, error: `Cannot accept a quote from state "${current}".` };

  const { data: allQuotes } = await db
    .from("quotes")
    .select("id, tradie_contact_id, status, quote_cents, call_out_fee_cents, contacts(full_name, email)")
    .eq("request_id", req.id);
  const rows = (allQuotes ?? []) as unknown as QuoteJoinRow[];
  const accepted = rows.find((q) => q.id === quoteId);
  if (!accepted) return { ok: false, error: "Quote not found for this request." };
  if (accepted.status !== "submitted") return { ok: false, error: "Only a submitted quote can be accepted." };

  await db.from("events").insert({
    org_id: req.org_id,
    aggregate_type: "maintenance_request",
    aggregate_id: req.id,
    event_type: "accept_quote",
    actor_type: actorType,
    actor_id: actorId,
  });
  await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);

  await db.from("quotes").update({ status: "accepted" }).eq("id", accepted.id);
  await db.from("events").insert({
    org_id: req.org_id,
    aggregate_type: "quote",
    aggregate_id: accepted.id,
    event_type: "quote_accepted",
    actor_type: actorType,
    actor_id: actorId,
  });

  // v8: a slot chosen at booking is confirmed by this acceptance — no proposal
  // round. Otherwise George proposes from availability (v7 §3) and a human
  // confirms on a card.
  const [{ data: windows }, { data: reqDetail }] = await Promise.all([
    db
      .from("tradie_availability_windows")
      .select("day_of_week, start_time, end_time")
      .eq("tradie_contact_id", accepted.tradie_contact_id),
    db
      .from("maintenance_requests")
      .select("is_urgent, booked_start_at, booked_end_at")
      .eq("id", req.id)
      .maybeSingle(),
  ]);
  const bookedSlot = reqDetail?.booked_start_at
    ? { startAt: reqDetail.booked_start_at as string, endAt: (reqDetail.booked_end_at ?? reqDetail.booked_start_at) as string }
    : null;
  const slots = bookedSlot
    ? []
    : proposeSlots(
        ((windows ?? []) as Array<{ day_of_week: number; start_time: string; end_time: string }>).map((w) => ({
          dayOfWeek: w.day_of_week,
          startTime: w.start_time,
          endTime: w.end_time,
        })),
        { from: earliestSlotStart(new Date(), Boolean(reqDetail?.is_urgent)) },
      );

  const { data: createdWo } = await db
    .from("work_orders")
    .insert({
      org_id: req.org_id,
      request_id: req.id,
      tradie_contact_id: accepted.tradie_contact_id,
      status: "scheduled",
      quote_cents: accepted.quote_cents,
      call_out_fee_cents: accepted.call_out_fee_cents,
      quote_id: accepted.id,
      proposed_slots: bookedSlot
        ? null
        : slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
      scheduled_start_at: bookedSlot?.startAt ?? null,
      scheduled_end_at: bookedSlot?.endAt ?? null,
    })
    .select("id")
    .single();
  if (createdWo) {
    // Link the booking authorization to the work order it now backs.
    await db
      .from("payments")
      .update({ work_order_id: createdWo.id, updated_at: new Date().toISOString() })
      .eq("request_id", req.id)
      .is("work_order_id", null);
  }
  if (createdWo && slots.length > 0) {
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "work_order",
      aggregate_id: createdWo.id,
      event_type: "slots_proposed",
      actor_type: "system",
      actor_id: "george:scheduler",
      payload: { slots: slots.map((s) => s.startAt.toISOString()) },
    });
  }

  const declined = rows.filter((q) => q.id !== quoteId);
  for (const q of declined) {
    await db.from("quotes").update({ status: "not_selected" }).eq("id", q.id);
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "quote",
      aggregate_id: q.id,
      event_type: "quote_declined",
      actor_type: actorType,
      actor_id: actorId,
    });
  }

  // v8 R3: acceptance IS confirmation — authorize the payment plan now
  // (deposit slices settle immediately for milestone playbooks).
  await ensurePaymentPlan(db, req.id, Number(accepted.quote_cents ?? 0) + Number(accepted.call_out_fee_cents ?? 0));

  const acceptedContact = normalizeContact(accepted.contacts);
  return {
    ok: true,
    state: result.state,
    accepted: {
      tradieName: acceptedContact?.full_name ?? "",
      tradieEmail: acceptedContact?.email ?? "",
      quoteCents: accepted.quote_cents ?? 0,
      callOutFeeCents: accepted.call_out_fee_cents ?? 0,
    },
    declined: declined.map((q) => {
      const c = normalizeContact(q.contacts);
      return { tradieName: c?.full_name ?? "", tradieEmail: c?.email ?? "" };
    }),
  };
}

/**
 * Milestone capture (v8 §4): once a quote is accepted, the job's money plan
 * exists as payment slices. Fixed-band bookings already authorized a primary
 * slice at booking (no-op here). Milestone playbooks get deposit + balance
 * slices; the deposit — materials money — captures and transfers on the
 * spot, the balance stays a hold until verify.
 */
async function ensurePaymentPlan(
  db: ReturnType<typeof serviceClient>,
  requestId: string,
  totalCents: number,
): Promise<void> {
  if (totalCents <= 0) return;
  const { data: existing } = await db.from("payments").select("id").eq("request_id", requestId).limit(1);
  if (existing && existing.length > 0) return;
  const { data: req } = await db
    .from("maintenance_requests")
    .select("id, org_id, playbook_key, title")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return;
  const playbook = req.playbook_key ? getPlaybook(req.playbook_key) : null;
  const schedule = paymentScheduleFor(playbook ?? {}, totalCents);
  const psp = resolvePsp();
  for (const slice of schedule) {
    const auth = await psp.authorize({
      amountCents: slice.amountCents,
      requestId,
      description: `1Pacent ${req.title} (${slice.kind})`,
    });
    const settleNow = slice.captureOn === "confirmation";
    if (settleNow && auth.pspRef) {
      const captured = await psp.capture(auth.pspRef);
      if (captured.ok) await psp.transfer({ amountCents: slice.amountCents, description: `1Pacent deposit ${requestId}`, destination: null });
    }
    await db.from("payments").insert({
      org_id: req.org_id,
      request_id: requestId,
      status: settleNow ? "transferred" : "authorized",
      amount_cents: slice.amountCents,
      platform_fee_cents: splitPayment(slice.amountCents).platformFeeCents,
      kind: slice.kind,
      psp: psp.name,
      psp_ref: auth.pspRef ?? null,
    });
    if (settleNow) {
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "maintenance_request",
        aggregate_id: requestId,
        event_type: "payment_transferred",
        actor_type: "system",
        actor_id: "penny:psp",
        payload: { amountCents: slice.amountCents, kind: slice.kind, note: "Deposit captured at confirmation (materials)" },
      });
    }
  }
}

/** Fast-Pay opt-in lives on the tradie's rate card. */
async function tradieFastPayEnabled(
  db: ReturnType<typeof serviceClient>,
  tradieContactId: string | null,
): Promise<boolean> {
  if (!tradieContactId) return false;
  const { data } = await db
    .from("tradie_rate_cards")
    .select("fastpay_enabled")
    .eq("tradie_contact_id", tradieContactId)
    .maybeSingle();
  return Boolean((data as { fastpay_enabled?: boolean } | null)?.fastpay_enabled);
}

/** Once every invited quote for a request has resolved, rank the round and
 * auto-accept the winner when the property's policy allows it. Shared by the
 * human submission path and Nelly's auto-quote hook. Returns the accepted
 * payload or null. */
async function maybeAutoAcceptAfterQuoteRound(
  db: ReturnType<typeof serviceClient>,
  quoteId: string,
): Promise<{
  requestId: string;
  accepted: { tradieName: string; tradieEmail: string; quoteCents: number; callOutFeeCents: number };
  declined: Array<{ tradieName: string; tradieEmail: string }>;
} | null> {
  const { data: quoteRow } = await db.from("quotes").select("request_id").eq("id", quoteId).maybeSingle();
  if (!quoteRow) return null;

  const { data: siblingQuotes } = await db
    .from("quotes")
    .select("status")
    .eq("request_id", quoteRow.request_id);
  const stillInvited = (siblingQuotes ?? []).some((q) => q.status === "invited");
  if (stillInvited) return null;

  const { data: reqRow } = await db
    .from("maintenance_requests")
    .select("id, org_id, property_id, category, status")
    .eq("id", quoteRow.request_id)
    .maybeSingle();
  if (!reqRow || (reqRow.status as RequestState) !== "quoting") return null;

  const [allQuotes, trust, policyRules] = await Promise.all([
    supabaseData.listQuotesForRequest(reqRow.id),
    (async () => {
      const { data: submittedTradies } = await db
        .from("quotes")
        .select("tradie_contact_id")
        .eq("request_id", reqRow.id)
        .eq("status", "submitted");
      const ids = [...new Set((submittedTradies ?? []).map((r) => r.tradie_contact_id as string))];
      return supabaseData.getTradieTrustSummaries(ids);
    })(),
    db
      .from("approval_policy_rules")
      .select("max_total_cents, min_trust_score, exclude_categories")
      .eq("property_id", reqRow.property_id)
      .eq("enabled", true)
      .order("priority", { ascending: true }),
  ]);

  const rankable = allQuotes
    .filter((q) => q.status === "submitted" && q.quoteCents !== null && q.callOutFeeCents !== null)
    .map((q) => ({
      quoteId: q.quoteId,
      totalCents: q.quoteCents! + q.callOutFeeCents!,
      trustScore: scoreTrust(trust[q.tradieContactId] ?? { completedJobs: 0, avgAbsVariancePct: null }),
      availabilityScore: scoreAvailability({
        tradieRespondedWithinMinutes: q.respondedWithinMinutes,
        matchesTenantPreferredWindow: false,
        currentOpenJobCount: 0,
      }),
    }));
  if (rankable.length === 0) return null;
  const ranked = rankQuotes(rankable);
  const winner = ranked[0]!;

  const rules: ApprovalPolicyRule[] = ((policyRules.data ?? []) as Array<{
    max_total_cents: number | null;
    min_trust_score: number | null;
    exclude_categories: string[];
  }>).map((r) => ({
    maxTotalCents: r.max_total_cents,
    minTrustScore: r.min_trust_score,
    excludeCategories: (r.exclude_categories ?? []) as RequestCategory[],
  }));
  const policyResult = evaluateApprovalPolicy(rules, {
    category: reqRow.category as RequestCategory,
    totalCents: winner.totalCents,
    trustScore: winner.trustScore,
  });
  if (!policyResult.autoApprove) return null;

  const acceptResult = await acceptQuoteTx(db, reqRow, winner.quoteId, "system", "approval-policy");
  if (!acceptResult.ok || !acceptResult.accepted || !acceptResult.declined) return null;
  return { requestId: reqRow.id, accepted: acceptResult.accepted, declined: acceptResult.declined };
}

/** The tradie's own rate-card price for a category — never AI-invented. */
async function rateCardSuggestion(
  db: ReturnType<typeof serviceClient>,
  tradieContactId: string,
  category: RequestCategory,
): Promise<{
  rateCardId: string;
  autoQuoteEnabled: boolean;
  autoQuoteMaxTotalCents: number | null;
  callOutFeeCents: number;
  suggestedQuoteCents: number | null;
} | null> {
  const { data: rateCard } = await db
    .from("tradie_rate_cards")
    .select("id, call_out_fee_cents, hourly_rate_cents, auto_quote_enabled, auto_quote_max_total_cents")
    .eq("tradie_contact_id", tradieContactId)
    .maybeSingle();
  if (!rateCard) return null;
  const { data: item } = await db
    .from("tradie_rate_card_items")
    .select("flat_price_cents, typical_minutes")
    .eq("rate_card_id", rateCard.id)
    .eq("category", category)
    .maybeSingle();
  let suggested: number | null = null;
  if (item?.flat_price_cents != null) suggested = Number(item.flat_price_cents);
  else if (item?.typical_minutes != null)
    suggested = Math.round((Number(rateCard.hourly_rate_cents) * Number(item.typical_minutes)) / 60);
  return {
    rateCardId: rateCard.id,
    autoQuoteEnabled: Boolean(rateCard.auto_quote_enabled),
    autoQuoteMaxTotalCents:
      rateCard.auto_quote_max_total_cents === null ? null : Number(rateCard.auto_quote_max_total_cents),
    callOutFeeCents: Number(rateCard.call_out_fee_cents),
    suggestedQuoteCents: suggested,
  };
}

interface TokenRow {
  id: string;
  org_id: string;
  token_hash: string;
  scope: TokenScope;
  aggregate_id: string | null;
  contact_id: string | null;
  expires_at: string;
  used_at: string | null;
}

async function resolveToken(rawToken: string, expectedScope: TokenScope): Promise<TokenRow | null> {
  const db = serviceClient();
  const { data } = await db
    .from("access_tokens")
    .select("id, org_id, token_hash, scope, aggregate_id, contact_id, expires_at, used_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as TokenRow;
  const check = validateToken(
    rawToken,
    {
      tokenHash: row.token_hash,
      scope: row.scope,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
    },
    expectedScope,
  );
  return check.ok ? row : null;
}

/** Resolve a token whose scope may be any of `allowed` (the canvas is one
 * surface for four personas). Validation still runs against the row's own
 * scope, so expiry/single-use rules hold. */
async function resolveTokenAny(rawToken: string, allowed: TokenScope[]): Promise<TokenRow | null> {
  const db = serviceClient();
  const { data } = await db
    .from("access_tokens")
    .select("id, org_id, token_hash, scope, aggregate_id, contact_id, expires_at, used_at")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as TokenRow;
  if (!allowed.includes(row.scope)) return null;
  const check = validateToken(
    rawToken,
    {
      tokenHash: row.token_hash,
      scope: row.scope,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at ? new Date(row.used_at) : null,
    },
    row.scope,
  );
  return check.ok ? row : null;
}

// ——— v8 R1 helpers ———

/** Crews (v8 R5b): a staff member acts FOR their employer. The business id
 * is the commercial identity (offers, work orders, money, trust); the
 * person's own id keeps presence/geolocation and attribution. */
async function tradieBusinessId(db: ReturnType<typeof serviceClient>, contactId: string): Promise<string> {
  const { data } = await db.from("contacts").select("employer_contact_id").eq("id", contactId).maybeSingle();
  return ((data as { employer_contact_id?: string | null } | null)?.employer_contact_id ?? contactId) as string;
}

/** Businesses with anyone online — the owner OR any of their crew. */
async function onlineTradieIds(db: ReturnType<typeof serviceClient>): Promise<string[]> {
  const { data } = await db
    .from("tradie_presence")
    .select("tradie_contact_id, contacts!tradie_presence_tradie_contact_id_fkey(employer_contact_id)")
    .eq("online", true);
  const ids = ((data ?? []) as Array<{
    tradie_contact_id: string;
    contacts: { employer_contact_id: string | null } | { employer_contact_id: string | null }[] | null;
  }>).map((r) => {
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return c?.employer_contact_id ?? r.tradie_contact_id;
  });
  return [...new Set(ids)];
}

async function bookablePropertyId(
  db: ReturnType<typeof serviceClient>,
  token: string,
  propertyId?: string,
): Promise<string | null> {
  const row = await resolveTokenAny(token, ["tenant_intake", "owner_portal"]);
  if (!row) return null;
  if (row.scope === "tenant_intake") return row.aggregate_id;
  const { data: owned } = await db.from("properties").select("id").eq("owner_contact_id", row.aggregate_id);
  const ownedIds = ((owned ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (propertyId) return ownedIds.includes(propertyId) ? propertyId : null;
  return ownedIds[0] ?? null;
}

async function evidenceItemsFor(
  db: ReturnType<typeof serviceClient>,
  workOrderId: string,
): Promise<PlaybookEvidenceItem[]> {
  const { data } = await db.from("job_evidence").select("gate, created_at").eq("work_order_id", workOrderId);
  return ((data ?? []) as Array<{ gate: string; created_at: string }>).map((e) => ({
    gate: e.gate as PlaybookEvidenceItem["gate"],
    at: new Date(e.created_at),
  }));
}

async function contactName(db: ReturnType<typeof serviceClient>, contactId: string): Promise<string | null> {
  const { data } = await db.from("contacts").select("full_name").eq("id", contactId).maybeSingle();
  return (data?.full_name as string | undefined) ?? null;
}

async function supabaseAssetsFor(db: ReturnType<typeof serviceClient>, propertyId: string) {
  const medians = await categoryMedians(db);
  const today = new Date();
  const { data: assets } = await db
    .from("property_assets")
    .select("id, label, category, installed_at, manufacturer, model, serial_number, receipt_data_url, purchased_at, manufacturer_warranty_months, properties(address_line1, suburb, state, postcode)")
    .eq("property_id", propertyId);
  return ((assets ?? []) as Array<{
    id: string;
    label: string;
    category: string;
    installed_at: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    receipt_data_url: string | null;
    purchased_at: string | null;
    manufacturer_warranty_months: number | null;
    properties:
      | { address_line1: string; suburb: string; state: string; postcode: string }
      | { address_line1: string; suburb: string; state: string; postcode: string }[]
      | null;
  }>).map((a) => {
    const prop = Array.isArray(a.properties) ? a.properties[0] : a.properties;
    const horizon = assessAssetHorizon({
      category: a.category as RequestCategory,
      installedAt: a.installed_at ? new Date(a.installed_at) : today,
      today,
    });
    const mfrWarrantyUntil =
      a.purchased_at && a.manufacturer_warranty_months
        ? new Date(new Date(a.purchased_at).getTime() + a.manufacturer_warranty_months * 30 * 86_400_000).toISOString()
        : null;
    return {
      assetId: a.id,
      propertyAddress: prop ? `${prop.address_line1}, ${prop.suburb} ${prop.state} ${prop.postcode}` : "",
      assetLabel: a.label,
      category: a.category as RequestCategory,
      ageYears: a.installed_at ? horizon.ageYears : 0,
      effectiveLifeYears: horizon.effectiveLifeYears,
      remainingLifeYears: a.installed_at ? horizon.remainingLifeYears : horizon.effectiveLifeYears,
      status: a.installed_at ? horizon.status : ("healthy" as const),
      plannedReplacementCents: medians[a.category as RequestCategory] ?? null,
      disclaimer: "planning_estimate" as const,
      manufacturer: a.manufacturer,
      model: a.model,
      serialNumber: a.serial_number,
      receiptOnFile: Boolean(a.receipt_data_url),
      manufacturerWarrantyUntil: mfrWarrantyUntil,
    };
  });
}

// ——— Talk / See / Do helpers (v6): deterministic projections, no LLM ———

/** The property set a seat token may read — the data-layer security boundary. */
async function scopedPropertyIds(
  db: ReturnType<typeof serviceClient>,
  scopeToken: string,
): Promise<string[] | null> {
  const row = await resolveTokenAny(scopeToken, ["owner_portal", "pm_portfolio"]);
  if (!row) return null;
  if (row.scope === "owner_portal") {
    const { data } = await db.from("properties").select("id").eq("owner_contact_id", row.aggregate_id);
    return ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
  }
  const { data } = await db.from("properties").select("id").eq("pm_contact_id", row.contact_id);
  return ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
}

/** Median invoice per category across the network — the Cost Index. */
async function categoryMedians(
  db: ReturnType<typeof serviceClient>,
): Promise<Partial<Record<RequestCategory, number>>> {
  const { data } = await db
    .from("work_orders")
    .select("invoice_cents, maintenance_requests!work_orders_request_id_fkey(category)")
    .not("invoice_cents", "is", null);
  const byCategory = new Map<RequestCategory, number[]>();
  for (const row of (data ?? []) as Array<{
    invoice_cents: number;
    maintenance_requests: { category: string } | { category: string }[] | null;
  }>) {
    const req = Array.isArray(row.maintenance_requests) ? row.maintenance_requests[0] : row.maintenance_requests;
    if (!req) continue;
    const category = req.category as RequestCategory;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(Number(row.invoice_cents));
  }
  const medians: Partial<Record<RequestCategory, number>> = {};
  for (const [category, values] of byCategory) {
    const sorted = [...values].sort((a, b) => a - b);
    medians[category] = sorted[Math.floor(sorted.length / 2)]!;
  }
  return medians;
}

export async function spendingForProperties(
  db: ReturnType<typeof serviceClient>,
  propertyIds: string[],
  periodMonths: number,
): Promise<SpendingSummaryView> {
  if (propertyIds.length === 0) {
    return { periodMonths, totalCents: 0, jobCount: 0, byCategory: [] };
  }
  const { data } = await db
    .from("work_orders")
    .select(
      "invoice_cents, invoiced_at, created_at, maintenance_requests!work_orders_request_id_fkey!inner(category, property_id)",
    )
    .not("invoice_cents", "is", null)
    .in("maintenance_requests.property_id", propertyIds);
  const jobs = ((data ?? []) as Array<{
    invoice_cents: number;
    invoiced_at: string | null;
    created_at: string;
    maintenance_requests: { category: string; property_id: string } | { category: string; property_id: string }[] | null;
  }>)
    .map((row) => {
      const req = Array.isArray(row.maintenance_requests) ? row.maintenance_requests[0] : row.maintenance_requests;
      if (!req) return null;
      return {
        category: req.category as RequestCategory,
        invoiceCents: Number(row.invoice_cents),
        invoicedAt: new Date(row.invoiced_at ?? row.created_at),
        propertyId: req.property_id,
      };
    })
    .filter((j): j is NonNullable<typeof j> => j !== null);
  const summary = summariseSpending(jobs, {
    periodMonths,
    today: new Date(),
    networkMediansCents: await categoryMedians(db),
  });
  return {
    periodMonths: summary.periodMonths,
    totalCents: summary.totalCents,
    jobCount: summary.jobCount,
    byCategory: summary.byCategory,
  };
}

export async function obligationsForProperties(
  propertyIds: string[],
  horizonDays: number,
): Promise<ObligationsCalendarView> {
  const today = new Date();
  const details = (await Promise.all(propertyIds.map((id) => supabaseData.getProperty(id)))).filter(
    (p): p is PropertyDetail => p !== null,
  );
  const calendar = buildObligationsCalendar(
    details.map((p) => ({ propertyId: p.id, address: p.address, suburb: p.suburb, compliance: p.compliance })),
    { horizonDays, today },
  );
  return {
    horizonDays: calendar.horizonDays,
    totalObligations: calendar.totalObligations,
    months: calendar.months.map((m) => ({
      month: m.month,
      items: m.items.map((i) => ({
        propertyAddress: `${i.address}, ${i.suburb}`,
        requirementName: i.requirementName,
        dueAt: i.dueAt.toISOString(),
        daysUntilDue: i.daysUntilDue,
        status: i.status,
      })),
    })),
    batchable: calendar.batchable.map((b) => ({
      requirementKey: b.requirementKey,
      requirementName: b.requirementName,
      suburb: b.suburb,
      propertyAddresses: b.propertyAddresses,
      windowStart: b.windowStart.toISOString(),
      windowEnd: b.windowEnd.toISOString(),
    })),
  };
}

/** Which trade does a compliance requirement need? Routine categories only —
 * a scheduled check is never an "urgent repair". */
function complianceCategoryFor(requirementKey: string): RequestCategory {
  if (requirementKey.includes("gas")) return "plumbing_general";
  if (requirementKey.includes("electrical") || requirementKey.includes("rcd") || requirementKey.includes("smoke"))
    return "electrical_general";
  if (requirementKey.includes("pool")) return "garden_external";
  return "other";
}

/** Proposed-slot info for the slot-confirm cards. */
async function slotInfosForRequests(
  db: ReturnType<typeof serviceClient>,
  requestIds: string[],
): Promise<CanvasSlotInfo[]> {
  if (requestIds.length === 0) return [];
  const { data } = await db
    .from("work_orders")
    .select("id, request_id, proposed_slots, contacts(full_name)")
    .in("request_id", requestIds)
    .not("proposed_slots", "is", null);
  return ((data ?? []) as Array<{
    id: string;
    request_id: string;
    proposed_slots: Array<{ startAt: string; endAt: string }> | null;
    contacts: ContactJoin | ContactJoin[] | null;
  }>)
    .filter((w) => Array.isArray(w.proposed_slots) && w.proposed_slots.length > 0)
    .map((w) => ({
      requestId: w.request_id,
      workOrderId: w.id,
      tradieName: normalizeContact(w.contacts)?.full_name ?? "the tradie",
      options: w.proposed_slots!.map((s) => ({
        startAt: s.startAt,
        endAt: s.endAt,
        label: formatSlot({ startAt: new Date(s.startAt), endAt: new Date(s.endAt) }),
      })),
    }));
}

async function buildDataPackPayload(
  db: ReturnType<typeof serviceClient>,
  propertyId: string,
  scopedIds: string[],
): Promise<Record<string, unknown>> {
  const property = await supabaseData.getProperty(propertyId);
  if (!property) return {};
  const today = new Date();
  const medians = await categoryMedians(db);

  const { data: assetRows } = await db
    .from("property_assets")
    .select("label, category, installed_at")
    .eq("property_id", propertyId);
  const assets = ((assetRows ?? []) as Array<{ label: string; category: string; installed_at: string | null }>).map(
    (a) => {
      const median = medians[a.category as RequestCategory];
      const depreciation =
        a.installed_at && median
          ? estimateDepreciation({
              category: a.category as RequestCategory,
              installedAt: new Date(a.installed_at),
              replacementCostCents: median,
              today,
            })
          : null;
      return { label: a.label, category: a.category, installedAt: a.installed_at, depreciation };
    },
  );

  const { data: historyRows } = await db
    .from("work_orders")
    .select(
      "invoice_cents, invoiced_at, contacts(full_name), maintenance_requests!work_orders_request_id_fkey!inner(title, category, property_id)",
    )
    .not("invoice_cents", "is", null)
    .eq("maintenance_requests.property_id", propertyId);
  const maintenanceHistory = ((historyRows ?? []) as unknown as Array<{
    invoice_cents: number;
    invoiced_at: string | null;
    contacts: ContactJoin | ContactJoin[] | null;
    maintenance_requests: { title: string; category: string } | { title: string; category: string }[] | null;
  }>).map((row) => {
    const req = Array.isArray(row.maintenance_requests) ? row.maintenance_requests[0] : row.maintenance_requests;
    return {
      title: req?.title ?? "",
      category: req?.category ?? "other",
      invoiceCents: Number(row.invoice_cents),
      tradieName: normalizeContact(row.contacts)?.full_name ?? "Unknown",
      invoicedAt: row.invoiced_at,
    };
  });

  return {
    // The honesty constraint (Product Design v6 §1.1), carried in the payload
    // itself so every rendering of this pack states it.
    disclaimer: "planning_estimate",
    disclaimerText:
      "Depreciation figures are planning estimates from a curated effective-life table. An ATO-defensible capital-works schedule requires a registered quantity surveyor. This pack is the verified data feed that makes that job trivial — it is not a tax schedule.",
    property: { address: property.address, suburb: property.suburb },
    generatedAt: today.toISOString(),
    assets,
    maintenanceHistory,
    openWarranties: property.openWarranties,
    compliance: {
      overall: property.compliance.overall,
      requirements: property.compliance.requirements.map((r) => ({
        name: r.requirement.name,
        status: r.status,
        lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
        dueAt: r.dueAt?.toISOString() ?? null,
      })),
    },
    spending: await spendingForProperties(db, scopedIds.includes(propertyId) ? [propertyId] : [propertyId], 12),
  };
}

// Compile-time guard: request event names used above must stay in the
// canonical list exported by core.
const _guard: readonly RequestEvent[] = REQUEST_EVENTS;
void _guard;
