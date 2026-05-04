begin;

-- Upsert organization by external_ref (idempotent)
create or replace function public.dl_org_upsert(
  p_external_ref text,
  p_name text,
  p_org_type text,
  p_country text,
  p_city text,
  p_industry text,
  p_tags text[]
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.organizations (external_ref, name, org_type, country, city, industry, tags)
  values (p_external_ref, p_name, coalesce(p_org_type,'org'), p_country, p_city, p_industry, coalesce(p_tags,'{}'::text[]))
  on conflict (external_ref)
  do update set
    name = excluded.name,
    org_type = excluded.org_type,
    country = excluded.country,
    city = excluded.city,
    industry = excluded.industry,
    tags = excluded.tags
  returning id into v_id;

  return jsonb_build_object('ok', true, 'org_id', v_id);
end;
$$;

-- Upsert edge (idempotent via unique key)
-- NOTE: If you already have a unique constraint on (from_pid,to_pid,edge_type) keep it consistent.
-- If you don't, we add it safely.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'graph_edges_unique_from_to_type'
  ) then
    alter table public.graph_edges
      add constraint graph_edges_unique_from_to_type unique (from_pid, to_pid, edge_type);
  end if;
end$$;

create or replace function public.dl_edge_upsert(
  p_from_pid text,
  p_to_pid text,
  p_edge_type text,
  p_verified boolean,
  p_weight_base numeric,
  p_weight_meta jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.graph_edges (from_pid, to_pid, edge_type, verified, weight_base, weight_meta)
  values (p_from_pid, p_to_pid, p_edge_type, coalesce(p_verified,false), coalesce(p_weight_base,1), coalesce(p_weight_meta,'{}'::jsonb))
  on conflict (from_pid, to_pid, edge_type)
  do update set
    verified = excluded.verified,
    weight_base = excluded.weight_base,
    weight_meta = excluded.weight_meta
  returning id into v_id;

  return jsonb_build_object('ok', true, 'edge_id', v_id);
end;
$$;

grant execute on function public.dl_org_upsert(text,text,text,text,text,text,text[]) to anon, authenticated;
grant execute on function public.dl_edge_upsert(text,text,text,boolean,numeric,jsonb) to anon, authenticated;

commit;