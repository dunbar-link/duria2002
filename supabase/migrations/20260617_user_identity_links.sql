-- OTP Phase 0: Supabase Auth 계정(auth.users)과 기존 브라우저 localStorage 의
-- dl-user-id(legacy_user_id)를 연결하는 매핑 테이블.
--
-- 목적:
--   기존 dl_invites / signals 등의 text owner 를 재작성하지 않고, 인증 후 조회 시
--   auth.uid() -> legacy_user_id 로 소유권을 "확장"하기 위한 토대.
--   (앱 로그인/연결 코드는 Phase 1 에서 별도 구현. 이 migration 은 스키마/RLS 만.)
--
-- 불변식:
--   - 하나의 legacy_user_id 는 하나의 auth 계정에만 연결된다(legacy UNIQUE).
--   - client 가 보낸 auth_user_id 는 신뢰하지 않는다(RLS 로 auth.uid() 강제).
--   - 기존 행/owner 는 변경하지 않는다(추가만).
--
-- 의존: public.dl_touch_updated_at() (20260302_000001_dl_graph_path_probe.sql 에서 정의)

create extension if not exists pgcrypto;

create table if not exists public.user_identity_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  legacy_user_id text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 빈 문자열 legacy 금지(형식 상세 검증은 API 에서; migration 은 최소 제약만)
  constraint user_identity_links_legacy_not_blank
    check (length(btrim(legacy_user_id)) > 0),
  -- 한 legacy 는 한 계정에만(오연결/탈취 이전 방지)
  constraint user_identity_links_legacy_user_id_key
    unique (legacy_user_id),
  -- 같은 (auth, legacy) 조합 중복 생성 방지
  constraint user_identity_links_auth_legacy_key
    unique (auth_user_id, legacy_user_id)
);

create index if not exists idx_user_identity_links_auth_user_id
  on public.user_identity_links (auth_user_id);

-- updated_at 자동 갱신(기존 helper 재사용)
drop trigger if exists user_identity_links_touch_updated_at on public.user_identity_links;
create trigger user_identity_links_touch_updated_at
before update on public.user_identity_links
for each row execute function public.dl_touch_updated_at();

-- RLS: 본인(auth.uid()) 연결만 접근.
-- service_role 은 RLS 를 우회하므로, Phase 1 API 는 service_role 단독이 아니라
-- 반드시 세션의 auth.uid 검증과 함께 사용해야 한다(client 가 보낸 userId 불신).
alter table public.user_identity_links enable row level security;

-- 본인 연결만 조회
create policy user_identity_links_select_own
  on public.user_identity_links
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

-- 본인 auth_user_id 로만 생성(다른 사람 계정에 연결 금지)
create policy user_identity_links_insert_own
  on public.user_identity_links
  for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

-- 본인 행만 갱신(주로 status 변경). 소유자 범위를 벗어난 갱신 금지.
create policy user_identity_links_update_own
  on public.user_identity_links
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- DELETE 정책 없음: 일반 사용자의 임의 연결 해제 금지(복구 정책 확정 전).
-- 연결 해제는 status='revoked' UPDATE 또는 service_role 운영 절차로만 수행.
