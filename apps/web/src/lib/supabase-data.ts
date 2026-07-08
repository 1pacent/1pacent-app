import "server-only";
import {
  assertCents,
  decideApproval,
  evaluateProperty,
  hashToken,
  isUrgentCategory,
  issueToken,
  projectState,
  transition,
  validateQuoteSubmission,
  validateToken,
  REQUEST_EVENTS,
  type ActorType,
  type EvidenceRecord,
  type RequestCategory,
  type RequestEvent,
  type RequestState,
  type TokenScope,
} from "@1pacent/core";
import { serviceClient } from "./supabase";
import type {
  AcceptQuoteResult,
  ApprovalContext,
  DataSource,
  DispatchQuotesResult,
  IntakeContext,
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
    events: events
      .filter((e) => e.aggregate_id === row.id)
      .map((e) => ({
        eventType: e.event_type as RequestEvent,
        actorType: e.actor_type as ActorType,
        note: typeof e.payload?.note === "string" ? e.payload.note : undefined,
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
        "id, address_line1, suburb, state, postcode, jurisdiction, has_gas, has_pool, auto_approve_cap_cents, org_id, compliance_certificates(requirement_key, completed_at, expires_at), maintenance_requests(id, org_id, property_id, title, description, category, status, estimate_cents, reported_at)",
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
    return {
      id: property.id,
      address: property.address_line1,
      suburb: `${property.suburb} ${property.state} ${property.postcode}`,
      autoApproveCapCents: Number(property.auto_approve_cap_cents),
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

    const urgent = isUrgentCategory(extraction.category);
    const decision = decideApproval({
      category: extraction.category,
      estimateCents: 0,
      policy: { autoApproveCapCents: Number(prop.auto_approve_cap_cents) },
    });
    const followUp: RequestEvent =
      urgent && decision.outcome === "auto_approved" ? "auto_approve" : "request_approval";
    const state = projectState([
      { eventType: "triage", actorType: "system" },
      { eventType: followUp, actorType: "system" },
    ]);

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
    ]);
    if (evError) return { ok: false as const, error: `Could not record events: ${evError.message}` };

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
    return { ok: true as const };
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

    const current = req.status as RequestState;
    const result = transition(current, "accept_quote", "landlord");
    if (!result.ok) return { ok: false, error: `Cannot accept a quote from state "${current}".` };

    const { data: allQuotes } = await db
      .from("quotes")
      .select("id, tradie_contact_id, status, quote_cents, call_out_fee_cents, contacts(full_name, email)")
      .eq("request_id", requestId);
    const rows = (allQuotes ?? []) as unknown as QuoteJoinRow[];
    const accepted = rows.find((q) => q.id === quoteId);
    if (!accepted) return { ok: false, error: "Quote not found for this request." };
    if (accepted.status !== "submitted") return { ok: false, error: "Only a submitted quote can be accepted." };

    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "maintenance_request",
      aggregate_id: req.id,
      event_type: "accept_quote",
      actor_type: "landlord",
      actor_id: "dashboard",
    });
    await db.from("maintenance_requests").update({ status: result.state }).eq("id", req.id);

    await db.from("quotes").update({ status: "accepted" }).eq("id", accepted.id);
    await db.from("events").insert({
      org_id: req.org_id,
      aggregate_type: "quote",
      aggregate_id: accepted.id,
      event_type: "quote_accepted",
      actor_type: "landlord",
      actor_id: "dashboard",
    });

    await db.from("work_orders").insert({
      org_id: req.org_id,
      request_id: req.id,
      tradie_contact_id: accepted.tradie_contact_id,
      status: "scheduled",
      quote_cents: accepted.quote_cents,
      call_out_fee_cents: accepted.call_out_fee_cents,
      quote_id: accepted.id,
    });

    const declined = rows.filter((q) => q.id !== quoteId);
    for (const q of declined) {
      await db.from("quotes").update({ status: "not_selected" }).eq("id", q.id);
      await db.from("events").insert({
        org_id: req.org_id,
        aggregate_type: "quote",
        aggregate_id: q.id,
        event_type: "quote_declined",
        actor_type: "landlord",
        actor_id: "dashboard",
      });
    }

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
  },

  async getComparableJobs(propertyId: string, category: RequestCategory) {
    const db = serviceClient();
    const { data: prop } = await db.from("properties").select("org_id").eq("id", propertyId).maybeSingle();
    if (!prop) return [];
    const { data, error } = await db
      .from("work_orders")
      .select("invoice_cents, maintenance_requests!inner(org_id, category)")
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
    const { data, error } = await db
      .from("tradie_trust_scores")
      .select("tradie_contact_id, completed_jobs, avg_abs_variance_pct")
      .in("tradie_contact_id", tradieContactIds);
    if (error) throw new Error(`getTradieTrustSummaries: ${error.message}`);
    const summaries: Record<string, { completedJobs: number; avgAbsVariancePct: number | null }> = {};
    for (const row of (data ?? []) as Array<{
      tradie_contact_id: string;
      completed_jobs: number;
      avg_abs_variance_pct: number | null;
    }>) {
      summaries[row.tradie_contact_id] = {
        completedJobs: row.completed_jobs,
        avgAbsVariancePct: row.avg_abs_variance_pct,
      };
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

    return { pmName: contact.full_name as string, properties };
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
};

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

interface TokenRow {
  id: string;
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
    .select("id, token_hash, scope, aggregate_id, contact_id, expires_at, used_at")
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

// Compile-time guard: request event names used above must stay in the
// canonical list exported by core.
const _guard: readonly RequestEvent[] = REQUEST_EVENTS;
void _guard;
