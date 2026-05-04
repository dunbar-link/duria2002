create table if not exists public.dl_org_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  org_pid text not null,
  edge_label text not null check (edge_label in ('member', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_dl_org_aliases_alias
  on public.dl_org_aliases(alias);

create index if not exists idx_dl_org_aliases_org_pid
  on public.dl_org_aliases(org_pid);

insert into public.dl_org_aliases (alias, org_pid, edge_label, is_active)
values
  ('korea university', 'org:univ:korea-university', 'member', true),
  ('korea univ', 'org:univ:korea-university', 'member', true),
  ('고려대학교', 'org:univ:korea-university', 'member', true),
  ('고려대', 'org:univ:korea-university', 'member', true),
  ('tesla', 'org:company:tesla', 'employee', true),
  ('tesla, inc.', 'org:company:tesla', 'employee', true),
  ('테슬라', 'org:company:tesla', 'employee', true)
on conflict (alias) do update
set
  org_pid = excluded.org_pid,
  edge_label = excluded.edge_label,
  is_active = excluded.is_active;