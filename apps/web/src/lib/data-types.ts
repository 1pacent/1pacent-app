import type {
  ActorType,
  PropertyComplianceStatus,
  RequestCategory,
  RequestEvent,
  RequestState,
} from "@1pacent/core";

/** Shared surface both data sources (demo, Supabase) implement. */

export interface PropertySummary {
  id: string;
  address: string;
  suburb: string;
  autoApproveCapCents: number;
  compliance: PropertyComplianceStatus;
  openRequests: number;
}

export interface RequestView {
  id: string;
  title: string;
  description: string;
  category: RequestCategory;
  estimateCents: number | null;
  state: RequestState;
  events: Array<{ eventType: RequestEvent; actorType: ActorType; note?: string }>;
}

export interface PropertyDetail extends PropertySummary {
  requests: RequestView[];
}

export interface IntakeContext {
  property: { id: string; address: string; suburb: string };
}

export interface ApprovalContext {
  request: {
    id: string;
    title: string;
    description: string;
    category: RequestCategory;
    estimateCents: number | null;
    address: string;
  };
}

export interface IntakeInput {
  title: string;
  description: string;
  category: RequestCategory;
}

export type IntakeOutcome =
  | { ok: true; requestId: string; state: RequestState; urgent: boolean }
  | { ok: false; error: string };

export type DecisionOutcome = { ok: true; state: RequestState } | { ok: false; error: string };

/** Sally (conversational intake) */

export interface SallyConversationContext {
  conversationId: string;
  contactId: string;
  propertyId: string;
  propertyAddress: string;
  propertySuburb: string;
  tenantFirstName?: string;
}

export interface SallyMessageView {
  role: "tenant" | "sally";
  content: string;
}

export interface SallyMemoryChunkView {
  content: string;
}

export type SallyMemoryScope = "contact" | "property";
export type SallyMemoryChunkType = "fact" | "preference" | "summary";

export interface SallyMemoryChunkInput {
  scopeLevel: SallyMemoryScope;
  chunkType: SallyMemoryChunkType;
  content: string;
  embedding: number[];
}

export interface SallyExtractionInput {
  title: string;
  description: string;
  category: RequestCategory;
  aiMeta: { model: string; promptVersion: string; confidence: number };
}

/** 3-tradie quote marketplace */

export interface QuoteInvite {
  quoteId: string;
  tradieContactId: string;
  tradieName: string;
  tradieEmail: string;
  /** Raw (unhashed) token for the /q/[token] link — only ever returned once, at issuance. */
  token: string;
}

export interface DispatchQuotesResult {
  ok: true;
  invites: QuoteInvite[];
  requestTitle: string;
  requestDescription: string;
  propertyAddress: string;
}

export interface QuoteContext {
  quoteId: string;
  requestTitle: string;
  requestDescription: string;
  propertyAddress: string;
  tradieName: string;
}

export interface QuoteSummary {
  quoteId: string;
  tradieContactId: string;
  tradieName: string;
  tradieEmail: string;
  status: string;
  quoteCents: number | null;
  callOutFeeCents: number | null;
  note: string | null;
}

export interface AcceptQuoteResult {
  ok: boolean;
  error?: string;
  state?: RequestState;
  accepted?: { tradieName: string; tradieEmail: string; quoteCents: number; callOutFeeCents: number };
  declined?: Array<{ tradieName: string; tradieEmail: string }>;
}

export interface DataSource {
  listProperties(): Promise<PropertySummary[]>;
  getProperty(id: string): Promise<PropertyDetail | null>;
  getIntakeContext(token: string): Promise<IntakeContext | null>;
  lodgeIntake(token: string, input: IntakeInput): Promise<IntakeOutcome>;
  getApprovalContext(token: string): Promise<ApprovalContext | null>;
  decideApprovalByToken(token: string, decision: "approve" | "decline"): Promise<DecisionOutcome>;

  // Sally
  startSallyConversation(token: string): Promise<SallyConversationContext | null>;
  appendSallyMessage(conversationId: string, role: "tenant" | "sally", content: string): Promise<void>;
  getSallyMessages(conversationId: string): Promise<SallyMessageView[]>;
  retrieveSallyMemory(contactId: string, queryEmbedding: number[]): Promise<SallyMemoryChunkView[]>;
  writeSallyMemory(params: {
    conversationId: string;
    contactId: string;
    propertyId: string;
    chunks: SallyMemoryChunkInput[];
  }): Promise<void>;
  completeSallyConversation(conversationId: string, extraction: SallyExtractionInput): Promise<IntakeOutcome>;

  // Quotes
  dispatchQuotesForRequest(requestId: string): Promise<DispatchQuotesResult | { ok: false; error: string }>;
  getQuoteContext(token: string): Promise<QuoteContext | null>;
  submitQuoteByToken(
    token: string,
    input: { quoteCents: number; callOutFeeCents: number; note?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  listQuotesForRequest(requestId: string): Promise<QuoteSummary[]>;
  acceptQuote(requestId: string, quoteId: string): Promise<AcceptQuoteResult>;

  /** Quote-vs-actual trending per tradie (the trust signal). Keyed by tradieContactId. */
  getTradieTrustSummaries(
    tradieContactIds: string[],
  ): Promise<Record<string, { completedJobs: number; avgAbsVariancePct: number | null }>>;
}
