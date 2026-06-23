-- Phase 2 P2-1b: 다기기 백업/복원용 사용자 그래프 스냅샷 테이블.
--
-- 목적:
--   localStorage(사람 목록 / Home 배치 / Me 프로필)를 auth 계정 단위로 서버에
--   백업/복원한다. localStorage 가 당분간 source of truth 이고, 이 테이블은
--   미러/백업 역할이다(자동 hydrate/write sync 는 이 migration 범위 밖).
--
-- 불변식:
--   - 소유자 기준은 auth_user_id(=auth.uid()) 뿐이다. legacy_user_id 는 저장하지 않는다.
--   - client 가 보낸 어떤 id 도 권한 근거로 쓰지 않는다(RLS 로 auth.uid() 강제).
--   - person.id / Home slot(visible/hidden) / folder.memberIds 는 client 가 보낸
--     값을 그대로 보존한다. 서버는 재발급/remap 하지 않는다(jsonb 통짜 저장).
--   - 자동 계정 이전 없음. 한 계정당 한 행(PK = auth_user_id).
--   - 기존 행/소유자는 이 migration 에서 변경하지 않는다(테이블 신규 생성만).
--
-- 의존: public.dl_touch_updated_at() (20260302_000001_dl_graph_path_probe.sql 에서 정의)

create extension if not exists pgcrypto;

create table if not exists public.dl_user_graph_snapshot (
  auth_user_id   uuid primary key references auth.users (id) on delete cascade,
  -- 사람 목록 스냅샷(DashboardPerson[]). 항상 JSON 배열.
  people         jsonb not null default '[]'::jsonb,
  -- Home 배치 스냅샷(layers{visible/hidden} + folders). 항상 JSON 객체.
  home_layout    jsonb not null default '{}'::jsonb,
  -- Me 프로필 스냅샷(이름/연락/학교/회사/공개 flags + public imageUrl). 항상 JSON 객체.
  -- imageDataUrl(base64)은 API 단에서 차단하므로 여기 들어오지 않는다.
  me_profile     jsonb not null default '{}'::jsonb,
  -- 스냅샷 포맷 버전. 현재 1. 향후 정규화(C형) 전환 시 증가.
  schema_version int not null default 1,
  updated_at     timestamptz not null default now(),
  -- 방어: people 는 배열, home_layout/me_profile 은 객체만 허용(타입 오염 차단).
  constraint dl_user_graph_snapshot_people_is_array
    check (jsonb_typeof(people) = 'array'),
  constraint dl_user_graph_snapshot_home_layout_is_object
    check (jsonb_typeof(home_layout) = 'object'),
  constraint dl_user_graph_snapshot_me_profile_is_object
    check (jsonb_typeof(me_profile) = 'object'),
  -- schema_version 은 1 이상(현재 1만 API 에서 허용).
  constraint dl_user_graph_snapshot_schema_version_positive
    check (schema_version >= 1)
);

-- updated_at 자동 갱신(기존 helper 재사용). upsert 의 update 경로에서 now() 로 갱신.
drop trigger if exists dl_user_graph_snapshot_touch_updated_at on public.dl_user_graph_snapshot;
create trigger dl_user_graph_snapshot_touch_updated_at
before update on public.dl_user_graph_snapshot
for each row execute function public.dl_touch_updated_at();

-- RLS: 본인(auth.uid()) 행만 접근.
-- service_role 은 RLS 를 우회하므로, API 는 service_role 단독이 아니라 세션
-- (auth.uid()) client 로 접근한다(client 가 보낸 userId 불신).
alter table public.dl_user_graph_snapshot enable row level security;

-- 본인 행만 조회
create policy dl_user_graph_snapshot_select_own
  on public.dl_user_graph_snapshot
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

-- 본인 auth_user_id 로만 생성(다른 사람 계정에 백업 금지)
create policy dl_user_graph_snapshot_insert_own
  on public.dl_user_graph_snapshot
  for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

-- 본인 행만 갱신(소유자 범위를 벗어난 갱신 금지)
create policy dl_user_graph_snapshot_update_own
  on public.dl_user_graph_snapshot
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- DELETE 정책 없음: 일반 사용자의 스냅샷 삭제 금지(데이터 손실 방지).
-- 삭제/초기화가 필요하면 service_role 운영 절차로만 수행한다.
