-- P4-1B: signals 테이블 확장 — 2초 음성 신호(type='voice').
-- 기존 emoji row 는 type 기본값 'emoji' 로 채워져 무영향(backward-compatible).
-- 음성 신호는 24시간 만료(expires_at = 전송시각 + 24h, 서버 route 에서 기록).
-- 실제 cleanup 배치(row/storage 정리)는 P4-1D — 여기서는 스키마만.

alter table public.signals
  add column if not exists type text not null default 'emoji',
  add column if not exists audio_path text null,
  add column if not exists audio_mime text null,
  add column if not exists audio_duration_ms integer null,
  add column if not exists audio_size_bytes integer null,
  add column if not exists expires_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'signals_type_check'
  ) then
    alter table public.signals
      add constraint signals_type_check
        check (type in ('emoji', 'voice'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'signals_voice_fields_check'
  ) then
    alter table public.signals
      add constraint signals_voice_fields_check
        check (
          type <> 'voice'
          or (
            audio_path is not null
            and audio_mime is not null
            and audio_duration_ms is not null
            and audio_duration_ms between 1 and 2500
            and audio_size_bytes is not null
            and audio_size_bytes between 1 and 307200 -- 300KB
            and expires_at is not null                -- 24h 만료 필수
          )
        );
  end if;
end $$;

-- P4-1D cleanup 스캔용(만료 voice row 만 대상).
create index if not exists signals_expires_at_idx
  on public.signals (expires_at)
  where expires_at is not null;
