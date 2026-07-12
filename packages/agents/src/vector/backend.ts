/**
 * The vector-store seam (Product Brief v7 §2). Default remains today's
 * pgvector RPC inside the DataSource; setting QDRANT_URL re-homes Sally's
 * memory-chunk retrieval onto Qdrant (collection per org, cosine, 1536-dim)
 * with the retrieval interface unchanged for callers. Qdrant down →
 * pgvector serves recall; every dependency is an enhancer, none a single
 * point of failure.
 */

export interface VectorHit {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorBackend {
  readonly name: "qdrant" | "pgvector";
  upsert(input: {
    collection: string;
    points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>;
  }): Promise<void>;
  search(input: {
    collection: string;
    vector: number[];
    limit: number;
  }): Promise<VectorHit[]>;
}

export const QDRANT_VECTOR_SIZE = 1536;

export interface QdrantBackendOptions {
  url: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class QdrantBackend implements VectorBackend {
  readonly name = "qdrant" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly ensured = new Set<string>();

  constructor(private readonly opts: QdrantBackendOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.opts.apiKey ? { "api-key": this.opts.apiKey } : {}),
    };
  }

  private base(): string {
    return this.opts.url.replace(/\/$/, "");
  }

  /** Ensure-collection on first write (cosine, 1536-dim). */
  private async ensureCollection(collection: string): Promise<void> {
    if (this.ensured.has(collection)) return;
    const res = await this.fetchImpl(`${this.base()}/collections/${encodeURIComponent(collection)}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ vectors: { size: QDRANT_VECTOR_SIZE, distance: "Cosine" } }),
    });
    // 409 = already exists — fine.
    if (!res.ok && res.status !== 409) {
      throw new Error(`Qdrant ensure-collection failed (${res.status})`);
    }
    this.ensured.add(collection);
  }

  async upsert(input: {
    collection: string;
    points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }>;
  }): Promise<void> {
    await this.ensureCollection(input.collection);
    const res = await this.fetchImpl(
      `${this.base()}/collections/${encodeURIComponent(input.collection)}/points`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify({ points: input.points }),
      },
    );
    if (!res.ok) throw new Error(`Qdrant upsert failed (${res.status})`);
  }

  async search(input: {
    collection: string;
    vector: number[];
    limit: number;
  }): Promise<VectorHit[]> {
    const res = await this.fetchImpl(
      `${this.base()}/collections/${encodeURIComponent(input.collection)}/points/search`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ vector: input.vector, limit: input.limit, with_payload: true }),
      },
    );
    if (!res.ok) {
      // A missing collection just means nothing remembered yet.
      if (res.status === 404) return [];
      throw new Error(`Qdrant search failed (${res.status})`);
    }
    const body = (await res.json()) as {
      result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
    };
    return (body.result ?? []).map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload ?? {},
    }));
  }
}

export interface ResolveVectorEnv {
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
}

/** Qdrant when configured, else null (callers keep the pgvector RPC). */
export function resolveVectorBackend(
  env: ResolveVectorEnv,
  fetchImpl?: typeof fetch,
): VectorBackend | null {
  if (!env.QDRANT_URL) return null;
  return new QdrantBackend({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY, fetchImpl });
}
