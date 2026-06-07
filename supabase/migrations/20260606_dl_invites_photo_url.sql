-- Profile photo cross-device sync (Phase 1)
-- 이름 모델(inviter_name / accepted_person_name)과 동일하게,
-- 연결 상대의 "현재 Me 프로필 사진 public URL"을 dl_invites 에 저장한다.
-- 둘 다 nullable text. 기존 행/이름 동기화에 영향 없음(추가만).
alter table public.dl_invites
  add column if not exists inviter_photo_url text;

alter table public.dl_invites
  add column if not exists accepted_person_photo_url text;
