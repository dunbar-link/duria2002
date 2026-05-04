create extension if not exists pgcrypto;

create table if not exists public.dl_contact_people (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null,
  owner_pid text not null,

  contact_pid text not null unique,
  name text not null,

  city text,
  school text,
  company text,

  tier integer not null check (tier in (1, 5, 15, 50, 150)),
  trust integer not null check (trust >= 0 and trust <= 100),

  edge_label text not null default 'knows',
  graph_sync_status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dl_contact_people_owner_user_id
  on public.dl_contact_people(owner_user_id);

create index if not exists idx_dl_contact_people_owner_pid
  on public.dl_contact_people(owner_pid);

create index if not exists idx_dl_contact_people_graph_sync_status
  on public.dl_contact_people(graph_sync_status);

create or replace function public.set_dl_contact_people_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dl_contact_people_updated_at on public.dl_contact_people;

create trigger trg_dl_contact_people_updated_at
before update on public.dl_contact_people
for each row
execute function public.set_dl_contact_people_updated_at();