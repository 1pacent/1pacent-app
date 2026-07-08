-- Trust score decay (docs/DEVELOPER_BRIEF_v3.md §4.6): weight recent jobs
-- more heavily than a flat all-time average, so a tradie's score reflects
-- current performance, not performance from a year ago. Simple rolling
-- window (most recent 20 completed jobs) rather than exponential decay —
-- easy to reason about and audit, matching this project's preference for
-- deterministic, explainable logic over opaque smoothing.
--
-- completed_jobs stays a lifetime count (how experienced is this tradie
-- overall, which is what packages/core's classifyTrust/scoreTrust gate on);
-- only the variance averages are windowed to the most recent 20 jobs.

create or replace view tradie_trust_scores as
with recent_completed as (
  select
    wo.org_id,
    wo.tradie_contact_id,
    wo.invoice_cents,
    wo.quote_cents,
    row_number() over (partition by wo.tradie_contact_id order by wo.created_at desc) as rn
  from work_orders wo
  where wo.tradie_contact_id is not null and wo.invoice_cents is not null
)
select
  org_id,
  tradie_contact_id,
  count(*) as completed_jobs,
  avg((invoice_cents - quote_cents)::numeric / nullif(quote_cents, 0))
    filter (where quote_cents > 0 and rn <= 20) as avg_signed_variance_pct,
  avg(abs(invoice_cents - quote_cents)::numeric / nullif(quote_cents, 0))
    filter (where quote_cents > 0 and rn <= 20) as avg_abs_variance_pct
from recent_completed
group by org_id, tradie_contact_id;
