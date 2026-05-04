-- 20260304_s3_org_expand.sql
-- Sprint 3 Step 1: org graph expansion (company/city/industry) - additive only

begin;

-- 1) organizations metadata
alter table public.organizations
  add column if not exists org_type text default 'org',          -- 'university' | 'company' | 'city' | 'industry' | 'org'
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists industry text,
  add column if not exists tags text[] default '{}'::text[],
  add column if not exists external_ref text;                    -- for idempotent import keys

create index if not exists organizations_org_type_idx on public.organizations (org_type);
create index if not exists organizations_external_ref_idx on public.organizations (external_ref);

-- 2) graph_edges future weighting hooks (do NOT change BFS logic yet; just store columns)
alter table public.graph_edges
  add column if not exists verified boolean default false,
  add column if not exists weight_base numeric default 1,        -- base weight (later: dynamic)
  add column if not exists weight_meta jsonb default '{}'::jsonb;-- e.g. grad_overlap, overlap_count

create index if not exists graph_edges_verified_idx on public.graph_edges (verified);

commit;