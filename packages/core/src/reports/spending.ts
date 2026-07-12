import { assertCents, type Cents } from "../money";
import type { RequestCategory } from "../requests/urgency";

/**
 * Spending summary over completed (invoiced) jobs — the owner/PM "what have
 * I spent on Rose St this year?" answer (Product Design v6 §4.2). Pure:
 * completed jobs and network medians are passed in; core does no IO.
 */

export interface CompletedJobSpend {
  category: RequestCategory;
  invoiceCents: Cents;
  invoicedAt: Date;
  propertyId: string;
}

export interface CategorySpend {
  category: RequestCategory;
  totalCents: Cents;
  jobCount: number;
  /** Median for the same category across the network (Cost Index), if known. */
  networkMedianCents: Cents | null;
  /** Signed % delta of this owner's average job cost vs the network median;
   * negative = under the median. Null when no median or no jobs. */
  vsMedianPct: number | null;
}

export interface SpendingSummary {
  periodMonths: number;
  totalCents: Cents;
  jobCount: number;
  byCategory: CategorySpend[];
}

export function summariseSpending(
  completedJobs: readonly CompletedJobSpend[],
  options: {
    periodMonths: number;
    today: Date;
    /** Cost Index medians per category, where available. */
    networkMediansCents?: Partial<Record<RequestCategory, Cents>>;
  },
): SpendingSummary {
  if (!Number.isInteger(options.periodMonths) || options.periodMonths <= 0) {
    throw new RangeError(`periodMonths must be a positive integer, got ${options.periodMonths}`);
  }
  const cutoff = new Date(options.today.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - options.periodMonths);

  const inPeriod = completedJobs.filter(
    (j) => j.invoicedAt.getTime() > cutoff.getTime() && j.invoicedAt.getTime() <= options.today.getTime(),
  );

  const byCat = new Map<RequestCategory, { total: number; count: number }>();
  let totalCents = 0;
  for (const job of inPeriod) {
    assertCents(job.invoiceCents);
    totalCents += job.invoiceCents;
    const entry = byCat.get(job.category) ?? { total: 0, count: 0 };
    entry.total += job.invoiceCents;
    entry.count += 1;
    byCat.set(job.category, entry);
  }

  const byCategory: CategorySpend[] = [...byCat.entries()]
    .map(([category, { total, count }]) => {
      const median = options.networkMediansCents?.[category] ?? null;
      const avg = total / count;
      const vsMedianPct =
        median && median > 0 ? Math.round(((avg - median) / median) * 100) : null;
      return { category, totalCents: total, jobCount: count, networkMedianCents: median, vsMedianPct };
    })
    .sort((a, b) => b.totalCents - a.totalCents);

  return { periodMonths: options.periodMonths, totalCents, jobCount: inPeriod.length, byCategory };
}
