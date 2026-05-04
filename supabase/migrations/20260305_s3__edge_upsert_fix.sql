begin;

-- 1) unique constraint (from_id, to_id, edge_type)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'graph_edges_unique_fromid_toid_type'
  ) then
    alter table public.graph_edges
      add constraint graph_edges_unique_fromid_toid_type unique (from_id, to_id, edge_type);
  end if;
end$$;

-- 2) replace dl_edge_upsert to use UUID from_id/to_id
drop function if exists public.dl_edge_upsert(text,text,text,boolean,numeric,jsonb);

create or replace function public.dl_edge_upsert(
  p_from_id uuid,
  p_to_id uuid,
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
  insert into public.graph_edges (from_id, to_id, edge_type, verified, weight_base, weight_meta)
  values (p_from_id, p_to_id, p_edge_type, coalesce(p_verified,false), coalesce(p_weight_base,1), coalesce(p_weight_meta,'{}'::jsonb))
  on conflict (from_id, to_id, edge_type)
  do update set
    verified = excluded.verified,
    weight_base = excluded.weight_base,
    weight_meta = excluded.weight_meta
  returning id into v_id;

  return jsonb_build_object('ok', true, 'edge_id', v_id);
end;
$$;

grant execute on function public.dl_edge_upsert(uuid,uuid,text,boolean,numeric,jsonb) to anon, authenticated;

commit;