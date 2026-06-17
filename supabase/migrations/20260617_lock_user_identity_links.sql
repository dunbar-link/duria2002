-- OTP Phase 1: user_identity_links 는 앱에서 SELECT/INSERT 만 사용한다.
-- 연결 후 legacy_user_id 를 다른 값으로 위조·이전하는 경로를 원천 차단하기 위해
-- UPDATE 정책을 제거한다. (연결 해제/status 변경은 service_role 운영 절차로만)
--
-- 기존 적용 migration(20260617_user_identity_links.sql)은 수정하지 않고
-- 후속 migration 으로 분리해 적용 이력을 보존한다.

drop policy if exists user_identity_links_update_own on public.user_identity_links;
