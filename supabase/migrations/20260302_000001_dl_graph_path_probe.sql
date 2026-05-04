-- 20260302_000001_dl_graph_path_probe.sql
-- 목적:
-- 1) 그래프 테이블: dl_people, dl_edges
-- 2) 최단 경로 + 신뢰 tie-break 계산 RPC
-- 3) 코인 차감 + 경로 계산을 한 트랜잭션에서 처리하는 paid RPC (SECURITY DEFINER)
-- 4) Confidence Score Model v2 서버 계산 반환

begin;

-- 0) 안전장치: 필요한 extension
create extension if not exists pgcrypto;

-- 1) People (nodes)
create table if not exists public.dl_people (
  pid text primary key,
  name text not null,
  is_celebrity boolean not null default false,
  city text,
  company text,
  school text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dl_people_is_celebrity_idx on public.dl_people (is_celebrity);

-- 2) Edges (directed)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dl_edge_status') then
    create type public.dl_edge_status as enum ('accepted');
  end if;
end $$;

create table if not exists public.dl_edges (
  id uuid primary key default gen_random_uuid(),
  from_pid text not null references public.dl_people(pid) on delete cascade,
  to_pid text not null references public.dl_people(pid) on delete cascade,
  trust smallint not null check (trust >= 0 and trust <= 100),
  tier smallint not null check (tier in (1,5,15,50,150)),
  status public.dl_edge_status not null default 'accepted',
  label text,
  created_at timestamptz not null default now()
);

-- 동일 방향 중복 방지
create unique index if not exists dl_edges_from_to_uniq on public.dl_edges (from_pid, to_pid);

-- BFS용 탐색 인덱스
create index if not exists dl_edges_from_idx on public.dl_edges (from_pid) where status = 'accepted';
create index if not exists dl_edges_to_idx on public.dl_edges (to_pid) where status = 'accepted';

-- 3) updated_at 트리거(선택: people)
create or replace function public.dl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists dl_people_touch_updated_at on public.dl_people;
create trigger dl_people_touch_updated_at
before update on public.dl_people
for each row execute function public.dl_touch_updated_at();

-- 4) "me" 노드 보장 함수
create or replace function public.dl_ensure_me(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text := 'u_' || p_user_id::text;
begin
  insert into public.dl_people(pid, name, is_celebrity)
  values (v_pid, 'Me', false)
  on conflict (pid) do nothing;

  return v_pid;
end
$$;

-- 5) 최단 경로 + 신뢰 tie-break (무료 계산 함수)
-- tie-break 규칙:
-- 1) hops 최소
-- 2) bottleneck_trust(경로상 최소 trust) 최대
-- 3) sum_trust(경로 trust 합) 최대
create or replace function public.dl_path_probe(
  p_source_pid text,
  p_target_pid text,
  p_max_hops int default 6
)
returns table (
  hops int,
  bottleneck_trust int,
  sum_trust int,
  path_pids text[]
)
language sql
stable
as $$
with recursive bfs as (
  select
    array[p_source_pid]::text[] as path_pids,
    p_source_pid::text as node,
    0::int as hops,
    100::int as bottleneck_trust,
    0::int as sum_trust
  union all
  select
    (bfs.path_pids || e.to_pid)::text[] as path_pids,
    e.to_pid::text as node,
    (bfs.hops + 1)::int as hops,
    least(bfs.bottleneck_trust, e.trust)::int as bottleneck_trust,
    (bfs.sum_trust + e.trust)::int as sum_trust
  from bfs
  join public.dl_edges e
    on e.from_pid = bfs.node
   and e.status = 'accepted'
  where bfs.hops < p_max_hops
    and not (e.to_pid = any(bfs.path_pids))
),
candidates as (
  select *
  from bfs
  where node = p_target_pid
)
select
  c.hops,
  c.bottleneck_trust,
  c.sum_trust,
  c.path_pids
from candidates c
order by c.hops asc, c.bottleneck_trust desc, c.sum_trust desc
limit 1;
$$;

-- 6) paid RPC: 코인 차감 + 경로 계산 + Confidence v2 서버 계산
create or replace function public.dl_path_probe_paid(
  p_user_id uuid,
  p_target_pid text,
  p_cost int default 10,
  p_max_hops int default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_pid text;
  v_balance bigint;
  v_hops int;
  v_bottleneck int;
  v_sum int;
  v_path_pids text[];
  v_path jsonb;

  -- Confidence v2
  v_avg_trust numeric;
  v_hop_penalty int;
  v_confidence_raw numeric;
  v_confidence int;
  v_confidence_label text;
begin
  -- 1) 지갑 잠금 + 잔액 확인 + 차감
  select w.balance
    into v_balance
  from public.dl_wallets w
  where w.user_id = p_user_id
  for update;

  if v_balance is null then
    -- 지갑 없으면 0으로 생성
    insert into public.dl_wallets(user_id, balance)
    values (p_user_id, 0)
    returning balance into v_balance;

    -- 다시 잠금
    select w.balance
      into v_balance
    from public.dl_wallets w
    where w.user_id = p_user_id
    for update;
  end if;

  if v_balance < p_cost then
    raise exception 'INSUFFICIENT_COINS balance=% cost=%', v_balance, p_cost
      using errcode = 'P0001';
  end if;

  update public.dl_wallets
     set balance = balance - p_cost,
         updated_at = now()
   where user_id = p_user_id
   returning balance into v_balance;

  insert into public.dl_coin_ledger(user_id, delta, reason, ref)
  values (p_user_id, -p_cost, 'path_probe', jsonb_build_object(
    'target_pid', p_target_pid,
    'max_hops', p_max_hops
  ));

  -- 2) source pid 보장
  v_source_pid := public.dl_ensure_me(p_user_id);

  -- 3) 경로 계산
  select r.hops, r.bottleneck_trust, r.sum_trust, r.path_pids
    into v_hops, v_bottleneck, v_sum, v_path_pids
  from public.dl_path_probe(v_source_pid, p_target_pid, p_max_hops) r;

  if v_hops is null then
    return jsonb_build_object(
      'ok', true,
      'found', false,
      'cost', p_cost,
      'balance', v_balance,
      'source_pid', v_source_pid,
      'target_pid', p_target_pid,
      'max_hops', p_max_hops,
      'confidenceVersion', 'v2',
      'path', jsonb_build_array()
    );
  end if;

  -- 4) path 설명 가능한 JSON으로 변환
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'pid', p.pid,
      'name', p.name,
      'isCelebrity', p.is_celebrity,
      'city', p.city,
      'company', p.company,
      'school', p.school
    )
    order by x.ord
  ), '[]'::jsonb)
  into v_path
  from unnest(v_path_pids) with ordinality as x(pid, ord)
  join public.dl_people p on p.pid = x.pid;

  -- 5) Confidence v2 계산
  -- avgTrust = sumTrust / hops
  -- hopPenalty = max(0, hops - 1) * 6
  -- confidenceRaw = (0.55 * bottleneckTrust) + (0.45 * avgTrust) - hopPenalty
  -- confidence = clamp(round(confidenceRaw), 0, 100)
  v_avg_trust := case
    when v_hops is not null and v_hops > 0
      then (v_sum::numeric / v_hops::numeric)
    else 0
  end;

  v_hop_penalty := greatest(0, v_hops - 1) * 6;

  v_confidence_raw :=
      (0.55 * coalesce(v_bottleneck, 0))
    + (0.45 * coalesce(v_avg_trust, 0))
    - v_hop_penalty;

  v_confidence := least(100, greatest(0, round(v_confidence_raw)::int));

  v_confidence_label := case
    when v_confidence >= 80 then 'Strong Path'
    when v_confidence >= 60 then 'Good Path'
    when v_confidence >= 40 then 'Possible Path'
    when v_confidence >= 20 then 'Weak Path'
    else 'Fragile Path'
  end;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'cost', p_cost,
    'balance', v_balance,
    'source_pid', v_source_pid,
    'target_pid', p_target_pid,
    'max_hops', p_max_hops,
    'hops', v_hops,
    'bottleneckTrust', v_bottleneck,
    'sumTrust', v_sum,
    'avgTrust', round(v_avg_trust, 2),
    'hopPenalty', v_hop_penalty,
    'confidence', v_confidence,
    'confidenceLabel', v_confidence_label,
    'confidenceVersion', 'v2',
    'path', v_path
  );
end
$$;

commit;