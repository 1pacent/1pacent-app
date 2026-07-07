# ADR-001: Database platform — Supabase over Neon

**Status:** Accepted · 2026-07-07

## Context

Developer Brief v2 mandates an authenticated API tier and Postgres with
row-level security to fix the three launch-blockers (B1 no multi-tenancy
isolation, B2 unauthenticated webhooks, B3 public client → n8n coupling).
Two managed-Postgres candidates were evaluated: **Supabase** and **Neon**.

The MVP needs, concretely:

1. Postgres with RLS, in an Australian region (APP data-residency posture).
2. Auth with **magic links** — the landlord approval flow and agency login
   are built on them.
3. **Object storage** with signed URLs for evidence photos and compliance
   certificates (hashed, EXIF-preserved).
4. A clear path for the API tier to run RLS-scoped queries per user.

## Decision

**Supabase (Sydney, `ap-southeast-2`).**

Neon is excellent serverless Postgres — branching databases per preview
deploy and scale-to-zero are genuinely nice. But Neon is *only* the
database. Choosing it means separately assembling and operating:

- an auth provider (Auth.js/Clerk) including magic-link delivery,
- object storage (S3/R2) plus a signed-URL layer,
- the RLS session-context plumbing that Supabase's `auth.uid()` +
  client libraries give for free.

For a small pre-revenue team, that is exactly the undifferentiated
plumbing the brief says not to build. Supabase collapses B1/B2/B3
remediation, auth, and the evidence vault into one managed service in
Sydney, and its free/pro tiers fit the current stage.

## Lock-in mitigation

- The schema lives in this repo as plain SQL migrations
  (`packages/db/migrations`) applied by our own runner — no proprietary
  migration format.
- All domain logic is in `packages/core` (pure TypeScript, zero Supabase
  imports).
- The only test-environment Supabase-ism is `auth.uid()`, which the RLS
  test harness stubs in four lines; policies otherwise use vanilla
  Postgres RLS.
- Migrating to Neon later ≈ `pg_dump | psql`, swap auth provider, point
  storage at S3. Painful but bounded; nothing in the domain layer changes.

## Consequences

- Tenant/tradie tokenised flows do **not** use Supabase Auth — they are
  validated by the API tier against `access_tokens` (SHA-256 hashes) and
  executed with the service role under explicit org scoping. This is by
  design: those personas never get accounts at MVP.
- n8n keeps running on the existing VPS as an internal worker, called
  only by the API tier with an internal auth header — it gets no public
  ingress and no direct DB superuser access.
- Preview-branch databases (Neon's headline feature) are approximated
  with Supabase branch databases or a disposable CI database; revisit if
  this becomes a real friction point.
