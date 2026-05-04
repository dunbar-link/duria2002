-- ============================================================================
-- Dunbar Link v2
-- Celebrity target registry + path label resolution helpers
-- 2026-03-07
-- ============================================================================

begin;

-- 1) Stable celebrity target registry
create table if not exists public.dl_celebrity_targets (
  pid text primary key,
  slug text unique not null,
  display_name text not null,
  country text null,
  category text not null default 'celebrity',
  is_active boolean not null default true,
  sort_order integer not null default 1000,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dl_celebrity_targets_pid_check check (pid like 'CELEB:%')
);

create index if not exists idx_dl_celebrity_targets_active_sort
  on public.dl_celebrity_targets (is_active, sort_order, display_name);

-- 2) updated_at helper trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dl_celebrity_targets_updated_at on public.dl_celebrity_targets;

create trigger trg_dl_celebrity_targets_updated_at
before update on public.dl_celebrity_targets
for each row
execute function public.set_updated_at();

-- 3) Seed initial celebrities
insert into public.dl_celebrity_targets (
  pid, slug, display_name, country, category, is_active, sort_order, metadata
)
values
  ('CELEB:ELON_MUSK', 'elon-musk', 'Elon Musk', 'US', 'celebrity', true, 10, '{"source":"seed"}'),
  ('CELEB:JAY_Y_LEE', 'jay-y-lee', '이재용', 'KR', 'business', true, 20, '{"source":"seed"}'),
  ('CELEB:MARK_ZUCKERBERG', 'mark-zuckerberg', 'Mark Zuckerberg', 'US', 'celebrity', true, 30, '{"source":"seed"}'),
  ('CELEB:SUNDAR_PICHAI', 'sundar-pichai', 'Sundar Pichai', 'US', 'business', true, 40, '{"source":"seed"}')
on conflict (pid) do update
set
  slug = excluded.slug,
  display_name = excluded.display_name,
  country = excluded.country,
  category = excluded.category,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

-- 4) PID -> display name resolver
create or replace function public.dl_resolve_node_label(p_pid text)
returns text
language plpgsql
stable
set search_path to public
as $$
declare
  v_label text;
  v_external_ref text;
begin
  if p_pid is null or btrim(p_pid) = '' then
    return 'Unknown';
  end if;

  -- user/self node
  if p_pid like 'u_%' then
    return 'Me';
  end if;

  -- organization node pattern: org:<external_ref>
  if p_pid like 'org:%' then
    v_external_ref := substring(p_pid from 5);

    select o.name
      into v_label
    from public.organizations o
    where o.external_ref = v_external_ref
    limit 1;

    if v_label is not null then
      return v_label;
    end if;

    return coalesce(v_external_ref, p_pid);
  end if;

  -- celebrity target registry
  if p_pid like 'CELEB:%' then
    select t.display_name
      into v_label
    from public.dl_celebrity_targets t
    where t.pid = p_pid
    limit 1;

    if v_label is not null then
      return v_label;
    end if;

    return replace(p_pid, 'CELEB:', '');
  end if;

  -- fallback: if pid exists in dl_nodes and has display_name-ish field later
  return p_pid;
end;
$$;

-- 5) PID -> node type resolver
create or replace function public.dl_resolve_node_type(p_pid text)
returns text
language plpgsql
stable
set search_path to public
as $$
begin
  if p_pid is null or btrim(p_pid) = '' then
    return 'unknown';
  end if;

  if p_pid like 'u_%' then
    return 'person';
  elsif p_pid like 'org:%' then
    return 'organization';
  elsif p_pid like 'CELEB:%' then
    return 'celebrity';
  else
    return 'unknown';
  end if;
end;
$$;

-- 6) Expand raw path json into presentable nodes
create or replace function public.dl_present_path(p_path jsonb)
returns jsonb
language sql
stable
set search_path to public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pid', elem->>'pid',
        'display_name', public.dl_resolve_node_label(elem->>'pid'),
        'node_type', public.dl_resolve_node_type(elem->>'pid'),
        'city', elem->>'city',
        'school', elem->>'school',
        'company', elem->>'company',
        'isCelebrity', coalesce((elem->>'isCelebrity')::boolean, false)
      )
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p_path) with ordinality as x(elem, ord);
$$;

commit;