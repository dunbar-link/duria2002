-- 1) (선택) 기존 중복을 먼저 제거
-- sendbird_message_id 기준으로 가장 먼저 들어온 row만 남기고 제거
-- ⚠️ 운영 데이터에 영향 있으니, 기존에 중복이 실제로 있는 경우에만 실행 권장
delete from public.messages a
using public.messages b
where a.id > b.id
  and a.sendbird_message_id = b.sendbird_message_id;

-- 2) 유니크 인덱스/제약 추가 (핵심)
-- Sendbird의 message_id는 앱 단위에서 유니크이므로 보통 이것만으로 충분
create unique index if not exists messages_sendbird_message_id_uniq
on public.messages (sendbird_message_id);