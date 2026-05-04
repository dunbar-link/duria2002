create table if not exists public.dl_graph_expansion_candidates (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'queued'
    check (status in ('queued', 'reviewing', 'approved', 'rejected', 'seeded', 'archived')),

  source_type text not null default 'approved_bridge'
    check (source_type in ('approved_bridge', 'manual', 'operator')),

  owner_user_id uuid not null,

  bridge_candidate_id uuid null,
  bridge_candidate_id_key text not null default '',

  target_pid text not null default '',
  target_name text null,
  target_category text null,
  target_country text null,

  bridge_name text null,
  bridge_city text null,
  bridge_school text null,
  bridge_company text null,

  match_score integer not null default 0,
  match_label text null,

  preview_path_hint text null,
  expansion_reason text null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dl_graph_expansion_candidates_owner_user_id
  on public.dl_graph_expansion_candidates (owner_user_id);

create index if not exists idx_dl_graph_expansion_candidates_status
  on public.dl_graph_expansion_candidates (status);

create index if not exists idx_dl_graph_expansion_candidates_target_pid
  on public.dl_graph_expansion_candidates (target_pid);

create index if not exists idx_dl_graph_expansion_candidates_created_at
  on public.dl_graph_expansion_candidates (created_at desc);

create unique index if not exists uq_dl_graph_expansion_candidates_bridge_candidate_id_key
  on public.dl_graph_expansion_candidates (
    owner_user_id,
    bridge_candidate_id_key
  )
  where bridge_candidate_id_key <> '';