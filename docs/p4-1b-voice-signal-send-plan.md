# P4-1B 2초 음성 신호 실전송 승인 설계

## 1. 전체 판정

**전체 판정: PASS** — 설계상 구현 가능. 단, 아래 §14 승인 필요 항목(migration·bucket 등) 승인 후에만 구현 착수.

- 작성일: 2026-07-02
- 성격: 승인 패키지 문서. **이 문서 외 코드 변경 없음. migration/bucket/route 전부 미실행·미생성.**
- 선행: P4-0 감사(docs/p4-0-voice-signal-audit.md), P4-1A preview(01b4f5d), P4-1A2 전면 배치(61816b3)

## 2. 현재 상태

- 음성 녹음/미리듣기: 완료(local preview). Android Chrome 실기기 PASS, iOS Safari 미검증(known-unverified), 카카오 인앱 미검증.
- 전송/DB/Storage/Push 연결: 없음.
- 재사용 가능한 기존 부품:
  - 인증: `lib/auth/invite-auth.ts` `getInviteSession()` — auth.getUser + `user_identity_links`→legacyIds 집합. client userId를 신뢰하지 않고 "세션 집합 포함 여부"로만 판정하는 패턴이 이미 확립됨(`/api/me/signal-days` 참고).
  - admin client: `lib/supabase/admin.ts` `createAdminClient()` — service role 업로드/insert에 사용.
  - 연결 원장: `dl_invites` (inviter_user_id, accepted_person_id, status, accepted_at …) — 서버측 연결 판정 근거.
  - 신호함: `app/dashboard/signals/page.tsx` — 사람별 그룹 + realtime + 읽음/삭제.
  - push: `/api/push/subscribe`, `/api/push/send`(web-push+VAPID), `public/sw.js`.
- 기존 리스크(P4-0): `/api/push/send` 무인증, expired subscription 정리 없음, signals RLS 미확인 → §9에서 처리 방안.

## 3. P4-1B 구현 범위

**한다:**
- 연결된 친구에게만 2초 음성 신호 전송 (서버 검증)
- 녹음 blob 업로드 → private Storage 저장
- signals row 생성 (type='voice')
- 수신자 신호함에서 재생 (signed URL, 자동재생 금지)
- 수신자 push 발송
- 발신자/수신자 삭제 가능
- 기존 이모지 신호 유지 (무변경)

**하지 않는다:** 영상 / 채팅방 / 답장 스레드 / 긴 음성 / 공개 피드 / 다운로드 버튼 / Point 차감 / 유료화 / 랭킹 / 2촌·3촌 탐색.

## 4. DB migration 초안 (실행 금지 — 승인 후 파일 작성)

기존 `signals` 테이블 확장(P4-0 추천안 A). nullable 추가라 기존 emoji row/코드에 무영향.

```sql
-- supabase/migrations/2026____p4_1b_signals_voice.sql (초안 — 미생성/미실행)
alter table public.signals
  add column if not exists type text not null default 'emoji',
  add column if not exists audio_path text null,
  add column if not exists audio_mime text null,
  add column if not exists audio_duration_ms integer null,
  add column if not exists audio_size_bytes integer null,
  add column if not exists expires_at timestamptz null;

alter table public.signals
  add constraint signals_type_check
    check (type in ('emoji', 'voice'));

-- voice 필수 필드 / emoji 무결성. emoji 컬럼은 NOT NULL 기존 유지 가정이므로
-- voice row 는 emoji 에 placeholder('🎙️') 저장(기존 UI 렌더 호환).
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
        and audio_size_bytes between 1 and 307200  -- 300KB
      )
    );

create index if not exists signals_expires_at_idx
  on public.signals (expires_at)
  where expires_at is not null;  -- P4-1D cleanup 스캔용
```

주의사항:
- `signals`는 Studio 생성 테이블이라 migration 기준선이 없음 → **ALTER만 담은 migration**으로 시작(CREATE 재정의 금지).
- constraint 추가 전 기존 row가 전부 type='emoji' default를 받으므로 위반 없음.
- 적용 방법(Supabase SQL editor vs CLI)은 적용 시점에 대장과 확인. **이번 단계에서는 실행 금지.**

## 5. Storage 설계

- bucket: **`voice-signals` (private)** — 신규 생성 필요(승인 항목). public URL 발급 금지.
- 접근: 업로드/삭제/서명 전부 **service role(서버 route)** 경유. 클라이언트에 Storage 직접 권한을 주지 않으므로 Storage RLS 정책을 별도로 열 필요 없음(기본 잠금 유지 = 가장 단순하고 안전).
- 재생: 서버 route가 권한 확인 후 **signed URL(TTL 120초 권장, 60초~5분 범위)** 발급.
- 파일 제한: bucket 레벨 file size limit 300KB + allowed MIME(`audio/webm`, `audio/mp4`) 설정 가능하면 이중 방어.

### path 비교

| 후보 | 장점 | 단점 |
|---|---|---|
| A. `{receiverId}/{signalId}.{ext}` ★추천 | 수신자 기준 정리·만료 스캔 쉬움. signalId=DB row 1:1이라 orphan 추적 명확. 경로 얕음 | sender별 조회는 DB로만(문제 없음 — DB가 진실원장) |
| B. `{receiverId}/{senderId}/{signalId}.{ext}` | 경로만으로 sender 식별 가능 | 깊이만 늘고 실익 없음. sender는 DB row에 이미 있음 |

**추천: A.** ext는 MIME에 따라 `webm` 또는 `m4a`(audio/mp4).

## 6. API route 설계 (파일 생성 금지 — 설계만)

### 6-1. `POST /api/signals/voice` — 전송

- 입력: `multipart/form-data` — `audio`(File), `receiverId`(string), `durationMs`(string→int)
- 처리 순서:
  1. `getInviteSession()` — 미로그인 401
  2. myIds = legacyIds + authUserId (sender는 이 집합에서 서버가 결정 — client 제출 senderId를 받지 않음)
  3. receiverId 형식 검증(비어있음/자기 자신 400)
  4. **연결 검증(§7)** — 미연결 403
  5. 파일 검증: MIME 허용목록, size ≤ 300KB, durationMs ≤ 2500 — 위반 413/415/400
  6. signalId(uuid) 생성 → service role로 Storage 업로드 `voice-signals/{receiverId}/{signalId}.{ext}`
  7. signals insert: `{ id: signalId, sender_id, receiver_id, emoji:'🎙️', type:'voice', audio_path, audio_mime, audio_duration_ms, audio_size_bytes, expires_at: now()+72h, is_read:false }`
  8. insert 실패 시 업로드한 object 삭제(보상 처리) 후 500
  9. push 발송(§9 내부 helper) — push 실패는 전송 실패로 취급하지 않음(로그만)
- 출력: `200 { ok:true, signalId }`
- 에러: 401 UNAUTHORIZED / 403 NOT_CONNECTED / 400 BAD_REQUEST / 413 FILE_TOO_LARGE / 415 UNSUPPORTED_MIME / 500 UPLOAD_FAILED·INSERT_FAILED

### 6-2. `GET /api/signals/voice-url?signalId=...` — 재생용 signed URL

- 처리: 세션 확인 → signals row 조회(service role) → `receiver_id ∈ myIds OR sender_id ∈ myIds` 아니면 403 → `expires_at < now()` 이면 410 EXPIRED → `createSignedUrl(audio_path, 120)` 발급
- 출력: `200 { ok:true, url, expiresIn:120 }`
- 에러: 401 / 403 FORBIDDEN / 404 NOT_FOUND / 410 EXPIRED / 500

### 6-3. `DELETE /api/signals/voice?signalId=...` — 삭제

- 처리: 세션 확인 → row 조회 → `sender_id ∈ myIds OR receiver_id ∈ myIds` 아니면 403 → **Storage object 먼저 삭제 → row 삭제** (object 삭제 실패 시에도 row 삭제는 진행하고 orphan 로그 — P4-1D cleanup이 회수)
- 출력: `200 { ok:true }`
- 비고: 기존 클라이언트 `deleteSignal()`(anon 직접 delete)은 emoji 전용으로 유지. voice row 삭제 UI는 이 route만 사용(Storage 정리 필요하므로). 신호함 삭제 버튼에서 `type==='voice'`면 이 route 호출로 분기.

## 7. 연결된 친구 권한 체크 (핵심)

- **금지**: client 제출 userId 신뢰, localStorage 인증 근거, people store(클라이언트 로컬)만으로 판정.
- 현재 emoji 신호의 `isConnectedSignalUserId()`는 **클라이언트 UI 차단일 뿐** → voice는 서버 강제 필요.
- **서버측 진실원장 = `dl_invites`**: 연결 = `status='accepted'`(또는 accepted_person_id not null)인 초대에서 한쪽이 나, 한쪽이 상대.
- 판정 쿼리(개념 — service role):

```
accepted = dl_invites where status='accepted'
connected(me, other) =
  exists( inviter_user_id ∈ myIds  AND accepted_person_id = other )
  OR exists( inviter_user_id = other AND accepted_person_id ∈ myIds )
```

- **myIds = getInviteSession().legacyIds + authUserId** — PC/모바일 기기별 legacy id가 달라도 같은 계정이면 같은 집합(signal-days와 동일 패턴이라 PC/모바일 일치 보장).
- receiverId는 **상대의 PID(연결 시점에 dl_invites에 박힌 id)** 를 그대로 사용 — 신호함/이모지 신호와 동일 좌표계라 수신자 조회(`receiver_id.eq.me`)와 push(`push_subscriptions.user_id`)에 그대로 맞음.
- 한계 기록: 상대가 여러 legacy id를 가진 계정이면 receiverId가 그중 하나로 고정됨 — 이는 기존 emoji 신호도 동일한 구조라 P4-1B에서 새로 악화되지 않음(추후 identity 통합 과제).

## 8. 음성 검증 정책

**클라이언트(이미 구현):** 2초 자동 정지, MIME fallback(webm;opus→webm→mp4), blob size 표시.

**서버(신규):**
- allowed MIME: `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4` — **audio/mpeg 불허**(녹음 산출물이 아님; 임의 파일 업로드 여지만 늘림)
- size ≤ 300KB (2초 opus ~8-16KB, AAC ~30KB의 10배 여유 — 남용 차단선)
- durationMs ≤ 2500 (client 제출값)
- **duration 검증 한계(명시):** 서버에서 실제 오디오 길이 검증은 디코딩(ffprobe류)이 필요해 Vercel 함수에서 과설계. client 제출 durationMs는 위조 가능하지만, **size 상한이 실효 방어선**(300KB면 opus 기준 수십 초가 물리적으로 불가는 아니나 저품질로 제한됨). 잔여 리스크는 "연결된 친구 사이"라는 관계 제약으로 수용하고, 서버 실검증은 남용 신고 발생 시 후속 과제로 보류.

## 9. Push 보강 설계

**voice 전송 후 push:**
- title: `"새 2초 음성 신호"` / body: `"{보낸 사람}님이 짧은 목소리 신호를 보냈어요"` (보낸 사람 이름은 dl_invites의 이름 컬럼에서, 없으면 "친구") / url: `/dashboard/signals` / icon·badge: 기존 sw.js 재사용(수정 없음).

**무인증 `/api/push/send` 문제 해결 — 권고: 내부 helper 분리:**
- `lib/push/send-push.ts` (서버 전용 helper) 신설 → web-push 발송 로직을 함수로 분리. `POST /api/signals/voice`가 **서버 내부에서 직접 호출**(HTTP 왕복 없음, 인증 문제 원천 회피).
- 기존 `/api/push/send` route는 emoji 경로가 쓰고 있으므로 **P4-1B에서는 수정하지 않음**. route에 인증 추가 + emoji 호출부 3곳 정리는 **P4-1C로 분리 권고**(이번에 묶으면 emoji 회귀 면적이 커짐).

**expired subscription cleanup:**
- helper 내에서 `sendNotification` 실패 statusCode 404/410이면 해당 endpoint를 `push_subscriptions`에서 delete. **P4-1B에 최소 포함 권고** — helper를 새로 짜는 김에 넣는 게 싸고, voice push 신뢰도에 직결. (단, 이 delete는 "만료 구독 정리"라는 제한적 write — 승인 항목에 명시.)

## 10. 수신/재생 UI (최소 변경)

- `app/dashboard/signals/page.tsx`: select에 voice 컬럼 추가(`type, audio_duration_ms, expires_at`), 신호 아이템 렌더에서 `type==='voice'` 분기:
  - 이모지 자리에 🎙️ + "2초 음성" 라벨
  - 탭 → `GET /api/signals/voice-url` 호출 → 성공 시 `<audio controls>` 표시(자동재생 금지, 사용자가 재생 버튼 탭)
  - 로딩 스피너 / 실패 "다시 시도" / 410이면 "만료된 신호예요" 표시
  - 읽음 처리(기존 markSignalRead)·삭제 버튼 유지(voice는 §6-3 route로 분기)
- `signal-bottom-sheet.tsx` + `voice-signal-preview.tsx`: preview 상태에 "보내기" 버튼 활성화(수신자 선택 모드의 selected 1명 이상일 때). 다중 수신자는 receiverId별 개별 업로드 — **P4-1B는 1명 제한 권장**(다중은 파일 복제 업로드가 필요해 후속).
- 홈/Me/People/bottom nav 변경 없음.

## 11. 만료/삭제 정책

**P4-1B 최소:**
- `expires_at = 전송시각 + 72h` 저장(컬럼만 활용)
- voice-url route가 만료면 410 → UI "만료된 신호예요"(재생 차단은 이것으로 성립)
- 수동 삭제(§6-3)

**P4-1D로 보류:**
- Storage object + row 실제 cleanup 배치(Vercel Cron vs Supabase pg_cron vs lazy 삭제 비교 후 결정)
- orphan object 회수
- 만료 시간 조정(24h/72h) 제품 판단

## 12. 개인정보/보안 리스크

- 음성 = 개인정보. public URL 금지, private bucket + signed URL(TTL 120초)만.
- 업로드/재생/삭제 전부 서버 세션 인증 + 본인/연결 검증. client userId 불신 원칙 유지.
- 자동재생 금지, 다운로드 버튼 없음(audio controls의 브라우저 기본 다운로드 메뉴는 완전 차단 불가 — 한계로 기록).
- 장기 보관 금지: expires_at 72h 기본, 실삭제는 P4-1D.
- 신고/차단 부재 → 연결된 친구에게만 + 2초 + 만료로 리스크 한정.
- iOS Safari 미검증(audio/mp4 경로), 카카오 인앱 미검증 — Android-first 유지, P4-1B 배포 후 가능 시 확인.
- `user_identity_links` UPDATE/DELETE 금지, service_role은 조회·업로드 도구로만(인증 대체 금지) — 기존 절대 금지 원칙 유지.

## 13. 구현 순서 (승인 후)

1. migration 파일 작성만(§4) — 적용은 별도 확인
2. private bucket `voice-signals` 생성 — **수동/승인**
3. migration 적용 — **승인**
4. `lib/push/send-push.ts` helper + 404/410 cleanup
5. `POST /api/signals/voice` 업로드 route
6. `GET /api/signals/voice-url` signed URL route
7. 신호함 voice 재생 UI
8. voice sheet 보내기 버튼 활성화(수신자 1명)
9. `DELETE /api/signals/voice` + 신호함 삭제 분기
10. tsc/build/home-regression + Android 실기기 E2E(전송→푸시→재생→삭제)
11. iOS 가능 시 후속 검증
12. expire/cleanup 배치는 P4-1D

## 14. 승인 필요 항목 (대장 결정)

| # | 항목 | 위험도 | 비고 |
|---|---|---|---|
| 1 | signals ALTER TABLE migration 적용 | 중 | nullable 추가 + check, 기존 row 무영향 설계 |
| 2 | private bucket `voice-signals` 생성 | 낮 | Supabase 대시보드 수동 생성 권장 |
| 3 | push 404/410 시 push_subscriptions delete | 낮 | 제한적 운영 write |
| 4 | 만료 기본값 72h | 제품 | 24h로 줄일지 판단 |
| 5 | P4-1B 수신자 1명 제한 | 제품 | 다중 전송은 후속 |
| 6 | /api/push/send 인증 보강을 P4-1C로 분리 | 정책 | 본 문서 권고안 |

## 15. 다음 구현 지시 초안 (P4-1B 실구현용)

> P4-1B 실구현. docs/p4-1b-voice-signal-send-plan.md 기준.
> 사전 확인: 대장이 bucket `voice-signals`(private) 생성 완료 + migration 적용 방식 합의.
> 구현: §13 순서 1→9. 파일: migration 1개 / lib/push/send-push.ts / app/api/signals/voice/route.ts / app/api/signals/voice-url/route.ts / signals page 재생 분기 / voice-signal-preview 보내기 버튼.
> 금지: /api/push/send·sw.js·emoji 전송 로직 수정, user_identity_links 접근, git add ., 아이콘 폴더.
> 검증: tsc / build / verify-home-regression 14체크 / Android 실기기 전송→푸시→재생→삭제 E2E.
> 커밋: 검증 PASS 후 "feat(signal): send 2s voice signals" 커밋·푸시.
