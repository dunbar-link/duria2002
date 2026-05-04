create table if not exists public.dl_bridge_candidates (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'saved'
    check (status in ('saved', 'reviewing', 'approved', 'rejected', 'expanded', 'archived')),

  source_type text not null default 'overlap'
    check (source_type in ('overlap', 'manual', 'operator', 'path')),

  owner_user_id uuid not null,
  other_owner_user_id uuid null,
  other_owner_user_id_key text not null default '',

  bridge_name text not null default '',
  bridge_city text null,
  bridge_school text null,
  bridge_company text null,

  bridge_name_key text not null default '',
  bridge_city_key text not null default '',
  bridge_school_key text not null default '',
  bridge_company_key text not null default '',

  match_score integer not null default 0,
  match_label text null,

  evidence_summary text null,

  suggested_target_pid text not null default '',
  suggested_target_name text null,
  preview_path_hint text null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dl_bridge_candidates_owner_user_id
  on public.dl_bridge_candidates (owner_user_id);

create index if not exists idx_dl_bridge_candidates_owner_status_created_at
  on public.dl_bridge_candidates (owner_user_id, status, created_at desc);

create index if not exists idx_dl_bridge_candidates_other_owner_user_id
  on public.dl_bridge_candidates (other_owner_user_id);

create index if not exists idx_dl_bridge_candidates_source_type
  on public.dl_bridge_candidates (source_type);

create index if not exists idx_dl_bridge_candidates_suggested_target_pid
  on public.dl_bridge_candidates (suggested_target_pid);

create unique index if not exists uq_dl_bridge_candidates_dedupe
  on public.dl_bridge_candidates (
    owner_user_id,
    other_owner_user_id_key,
    bridge_name_key,
    bridge_city_key,
    bridge_school_key,
    bridge_company_key,
    suggested_target_pid
  );