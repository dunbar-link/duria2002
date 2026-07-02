# P4-0 — 2초 음성 신호 + 푸시알림 read-only 설계 감사

- 작성일: 2026-07-02
- 기준 커밋: main / 83b6cee (Dunbar baseline)
- 성격: read-only 감사 문서. 이 문서 외 코드 변경 없음. 구현 금지 단계.
- 기능명: **2초 음성 신호** (음성 메시지 아님 — 대화방/스레드/답장 구조 금지)

---

## 1. 현재 signal 구조 (조사 결과)

### 1-1. DB: `signals` 테이블

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | PK |
| sender_id | text/uuid | 보낸 사람 user id |
| receiver_id | text/uuid | 받는 사람 user id |
| emoji | text | 이모지 1개 (payload는 emoji-only) |
| created_at | timestamp | |
| is_read | boolean | 기본 false |

- **migration 파일 없음** — Supabase Studio UI로 직접 생성된 테이블 (`supabase/migrations`에 CREATE TABLE 없음, `20260617_user_identity_links.sql` 주석에서만 존재 언급).
- Realtime(postgres_changes) 활성화됨.
- **RLS 정책은 코드에서 확인 불가.** 클라이언트가 anon key로 직접 insert/update/delete 하고 있어, RLS가 느슨하거나 없을 가능성이 있음(Supabase 대시보드 확인은 이번 범위 밖).

### 1-2. 전송 경로

- `lib/signal/send-signal.ts` — `sendSignal(senderId, receiverIds[], emoji)`. **클라이언트에서 anon client로 signals에 직접 insert.** 서버 API route 없음.
- 연결 친구 검증: `app/dashboard/people/data.ts`의 `isConnectedSignalUserId()` — **클라이언트 UI 차원 차단만 존재** (버튼 비활성화). 서버측 강제 없음.
- 전송 UI: `app/dashboard/_components/home/signal-bottom-sheet.tsx` (이모지 피커 + P2-5 수신자 선택 모드, `onSendSignal(emoji, receiverIds[])`).

### 1-3. 수신함 / 읽음 / 삭제

- `app/dashboard/signals/page.tsx`:
  - 조회: `sender_id.eq.me OR receiver_id.eq.me`, 최근 100개.
  - 읽음: `update is_read=true where id & receiver_id=me` (개별/일괄 둘 다 있음).
  - **삭제 기능 이미 존재**: `delete where id=signalId` (`lib/signal/delete-signal.ts`).
  - Realtime: `signals-page-{userId}` 채널, `receiver_id=eq.me` INSERT/UPDATE 감지 → 재조회.
- 사람별 그룹 UI(상대 이름/사진 + 이모지 pill + 인라인 패널) — **음성 재생 버튼을 얹기 좋은 구조.**

### 1-4. Point 연동

- `app/api/me/signal-days/route.ts` — signals에서 sender 기준 **KST 고유 날짜 수 × 5P** 서버 계산. `point-ledger.ts`의 `signalDay: 5`.
- 음성 신호를 signals 테이블에 넣으면 **기존 산식에 자동 포함**됨(신호 보낸 날짜로 카운트). 별도 +5P를 원하면 P4-1E에서 분리 설계 필요.

## 2. 현재 push 구조 (조사 결과)

| 구성요소 | 경로 | 상태 |
|---|---|---|
| 구독 저장 | `app/api/push/subscribe/route.ts` | `push_subscriptions` upsert(endpoint conflict) |
| 발송 | `app/api/push/send/route.ts` | web-push + VAPID, `Promise.allSettled` |
| service worker | `public/sw.js` | push 표시 + notificationclick → `data.url` (기본 `/dashboard/signals`) |
| SW 등록/구독 | `lib/push/push-client.ts` | `/sw.js` 등록 + pushManager.subscribe |
| 구독 UI | dashboard 헤더 "알림" 버튼, invite dashboard | 존재 |

- **payload는 이미 `{title, body, url}` 구조** — 음성 신호용 문구만 바꾸면 그대로 재사용 가능. icon/badge는 sw.js에서 favicon 고정.
- **이모지 신호 전송 시 push 이미 발송 중** (3곳: `app/dashboard/page.tsx:3292`, `signals/page.tsx`, `person-detail-client.tsx:1074`). 음성 신호도 같은 fetch 패턴 재사용 가능.
- 푸시 클릭 → `/dashboard/signals` 이동 이미 동작 (기존 창 focus + navigate / 새 창 open).
- 구독 없는 사용자: send가 subscription 0건이면 그냥 sent=0 — 안전.

### push 쪽 발견된 기존 리스크 (이번 작업에서 수정 금지, 보고만)

1. **`/api/push/send`에 인증 없음** — receiverIds만 검증하는 공개 API. 아무나 호출해 임의 사용자에게 푸시 스팸 가능. P4-1C에서 최소한 세션 인증 추가 검토 권장 (action-needed, 별도 승인 후).
2. **실패/만료 subscription 정리 없음** — 410/404 처리와 DB delete 미구현. 비활성 구독 누적. P4-1C 범위에 포함 권장.
3. `app/api/api/push/send/route.ts` — 308 redirect용 구버전 잔재 존재 (known-warn 후보).

## 3. Storage 사용 가능성 / 리스크

### 현재 상태

- Supabase Storage **이미 사용 중**: bucket `profile-images`, 경로 `{userId}/profile.{ext}`, **클라이언트 anon 업로드 + 공개(getPublicUrl) URL** (`app/dashboard/me/page.tsx:622-642`).
- 서버(service role) 클라이언트 인프라 존재: `lib/supabase/admin.ts` `createAdminClient()` — 여러 `/app/api/invites/*` route에서 사용 중. **서버 route 업로드 구현에 필요한 부품은 다 있음.**
- **파일 업로드(formData) 받는 API route는 아직 없음** — 음성용으로 신규 작성 필요 (P4-1B).
- `next.config.ts` 비어 있음 → 기본 한도. Vercel 함수 body 4.5MB. 2초 opus/webm은 **8~30KB 수준**이라 여유 큼.

### 음성 신호에 맞는 방식 (프로필 사진 방식 그대로 쓰면 안 됨)

| 항목 | 프로필 사진(현재) | 음성 신호(권장) |
|---|---|---|
| bucket | profile-images (공개 URL) | **voice-signals (private bucket)** |
| 업로드 주체 | 클라이언트 anon | **서버 API route (service role)** — 인증·연결검증·크기검증 후 업로드 |
| 재생 URL | 영구 공개 URL | **signed URL (짧은 만료, 60초~5분)** — receiver 본인 확인 후 발급 |

- 경로 후보: `voice-signals/{receiverId}/{signalId}.{ext}` 권장. receiverId 프리픽스로 정리(만료 삭제) 시 스캔이 쉽고, signalId가 DB row와 1:1이라 orphan 추적이 쉬움. senderId는 DB row에 있으므로 경로에 중복시킬 필요 없음.
- **주의: bucket은 아직 없음.** 생성은 P4-1B에서 대장 승인 후(대시보드 또는 migration). 이번 단계에서는 생성 금지 준수함.

## 4. 모바일 브라우저 녹음 리스크

| 리스크 | 내용 | 대응 |
|---|---|---|
| iOS Safari 포맷 | MediaRecorder는 iOS 14.3+ 지원이지만 **webm 미지원, `audio/mp4`(AAC)로 나옴** | `MediaRecorder.isTypeSupported()`로 `audio/webm;codecs=opus` → `audio/mp4` 순 fallback. 서버는 두 MIME 다 허용, 확장자 webm/m4a 분기 |
| 구형/특수 브라우저 | MediaRecorder 자체 미지원 가능(카카오 인앱 브라우저 등 주의) | 기능 감지 실패 시 녹음 버튼 숨김 + 안내 문구. **P4-1A(local preview)에서 실기기 확인이 핵심 목적** |
| HTTPS 필수 | getUserMedia는 secure context 전용 | vercel.app(HTTPS)·localhost 둘 다 OK — 문제 없음 |
| 마이크 권한 거부 | permission denied 시 예외 | try/catch + "마이크 권한을 허용해줘" 토스트, 재시도 버튼 |
| 2초 제한 | 클라이언트 `setTimeout(stop, 2000)` + UI 카운트다운. **클라이언트 제한은 위조 가능** | 서버에서 파일 크기 상한(예 200KB)으로 2차 방어. duration 정밀 검증(디코딩)은 과설계 — 크기 상한으로 충분 |
| 자동재생 금지 | 모바일은 어차피 user gesture 없는 audio.play() 차단 | 제품 요구(자동재생 금지)와 브라우저 정책이 일치 — 재생 버튼 탭으로만 재생 |
| 파일 크기 | 2초 opus ~8-16KB, AAC ~30KB | 상한 200KB면 넉넉하고 남용 차단 |

## 5. 개인정보 / 보안 리스크

음성은 **생체·개인정보 성격**이라 이모지보다 한 단계 높은 통제가 필요하다.

1. **현행 signal 쓰기 경로를 그대로 따라가면 안 됨.** 이모지는 클라이언트 anon insert + 클라이언트 연결검증뿐이다. 음성은 반드시 **서버 route에서**: 세션 인증 → sender=세션 본인 강제 → 연결된 친구인지 서버측 검증 → 크기/MIME 검증 → service role 업로드+insert.
2. **재생 권한**: receiver 본인만. 서버 route가 세션 확인 후 signed URL 발급(짧은 만료). 공개 URL 금지.
3. **삭제 권한**: sender 또는 receiver 본인 신호만. DB row 삭제 시 Storage 파일도 함께 삭제(orphan 방지).
4. **연결검증 근거**: 서버에서 쓸 수 있는 진실원장은 `dl_invites`(수락된 초대 = 연결). 서버 route에서 sender↔receiver 간 accepted invite 존재 확인하는 형태 권장 (정확한 판정 쿼리는 P4-1B 설계 시 확정).
5. **만료/삭제 배치**: 24~72시간 만료 정책이면 cleanup 필요. 현재 cron 인프라 없음. 후보: Vercel Cron / Supabase pg_cron / 읽을 때 lazy 삭제. P4-1D에서 결정.
6. **신고/차단 부재 리스크**: 음성은 텍스트 필터링이 불가능. 완화 요인 = 연결된 친구에게만 + 2초 + 만료. 그래도 문제가 생기면 대응 수단이 삭제뿐이므로, 만료(72h 이내)를 **선택이 아니라 기본값**으로 권장.
7. **기존 리스크 재확인**: `/api/push/send` 무인증(§2), signals RLS 미확인. 음성 기능이 이 위에 올라가므로 P4-1B/1C에서 서버측 검증을 넣는 것으로 상쇄한다.
8. `.env`/키는 이번 조사에서 변수명만 확인, 값 미출력.

## 6. 구현안 비교

### 안 A — 기존 `signals` 테이블 확장 ★추천

nullable 컬럼 추가: `type text default 'emoji'`, `audio_path text`, `audio_duration_ms int`, `expires_at timestamptz`.

- 장점:
  - 신호함/realtime/미읽음/삭제/사람별 그룹 UI **전부 재사용**. voice row는 재생 버튼만 추가 렌더.
  - "신호는 하나의 개념"이라는 던바링크 제품 철학과 일치. 수신자 입장에서 신호함 한 곳만 보면 됨.
  - Point signal-days 산식에 자동 포함(신호 보낸 날 카운트) — 산식 수정 없이 일관.
  - nullable 추가라 기존 emoji row/코드에 무영향(backward-compatible).
- 단점:
  - migration 필요(ALTER TABLE). signals가 Studio 생성 테이블이라 migration 파일 기준선이 없음 — ALTER만 담은 migration 작성으로 해결 가능.
  - emoji 컬럼 의미가 애매해짐 → voice row는 emoji='🎙️' 고정 저장으로 단순화(기존 UI가 이모지 렌더를 기대하므로 오히려 호환에 유리).
  - 쓰기 경로 이원화: emoji=클라이언트 직접 insert(현행 유지), voice=서버 route. 과도기적 비대칭이지만 수용 가능.

### 안 B — 별도 `dl_voice_signals` 테이블

- 장점: RLS/만료/삭제를 처음부터 깨끗하게 설계. `dl_` 명명규칙과 일치. 기존 signals 무접촉(홈 회귀 위험 0).
- 단점: 신호함이 **두 테이블 merge** 필요(정렬/미읽음/realtime 이중 구독), Point 산식도 별도 합산 필요. 코드량·회귀면적이 A보다 큼. "신호가 두 종류의 저장소"가 되는 구조 부채.

### 안 C — Storage 없이 local-only preview

- 장점: 가장 빠름. DB/Storage/migration 전부 불필요. **모바일 녹음 지원(§4 최대 리스크)을 실기기에서 먼저 검증** 가능.
- 단점: 전송이 안 되므로 실사용 의미 없음. 단독 최종안은 아님.

### 결론

**C를 P4-1A로 먼저 실행해 녹음 리스크를 걷어내고, 실전 구조는 A로 간다.** B는 A의 migration이 대장 판단으로 막힐 때의 대안으로 보관.

## 7. P4-1 구현 단계 제안 (구현은 대장 승인 후)

| 단계 | 내용 | DB/Storage | 핵심 검증 |
|---|---|---|---|
| P4-1A | 2초 녹음 UI + local preview (녹음→미리듣기→취소). 전송 없음 | 없음 | **iOS Safari/안드로이드 크롬/카카오 인앱 실기기 녹음 확인** |
| P4-1B | 연결 친구 1명에게 실제 전송. 서버 route(인증+연결검증+크기검증) → private bucket 업로드 + signals insert(type='voice') → 신호함 재생(signed URL)/삭제 | bucket 생성 + ALTER migration (각각 승인 필요) | 서버측 권한 4종(업로드/재생/삭제/연결) |
| P4-1C | 수신 푸시 연결(기존 /api/push/send 재사용, 문구: "🎙️ 2초 음성 신호가 왔어요.") + 실패 subscription 정리(410/404 delete) + send 인증 검토 | push_subscriptions delete | 푸시 클릭→신호함 이동 |
| P4-1D | 만료 정책(72h 기본 권장) + storage cleanup 방식 결정(Vercel Cron vs pg_cron vs lazy) | cleanup 대상 | dry-run 후 삭제 |
| P4-1E | Point: 하루 첫 음성 신호 +5P 별도 여부 결정. 주의 — 안 A면 기존 signal-days에 이미 포함되므로 "추가 5P"인지 "포함으로 충분"인지 제품 결정 필요 | 없음 | PC/모바일 Point 일치 유지 |

## 8. 절대 건드리면 안 되는 항목 (P4 전 단계 공통)

- `user_identity_links` UPDATE/DELETE, 자동 계정 이전
- 기존 emoji signal 전송 경로(`lib/signal/send-signal.ts`)의 동작 변경 — voice는 별도 경로로 추가만
- Point 기존 산식(`point-ledger.ts`, `/api/me/signal-days`) 무단 수정
- `public/sw.js` 캐싱 추가 등 확장(알림 표시/클릭 이상 손대지 않기)
- Home/Me/People 화면 구조 (홈 회귀 잠금: `scripts/verify-home-regression.mjs` 14체크 유지)
- `profile-images` bucket 정책 변경
- `push_subscriptions` 스키마 변경 (정리 delete는 P4-1C 승인 범위 내에서만)

## 8-1. P4-1A 실기기 확인 메모 (2026-07-02)

- **Android Chrome 실기기: PASS** — 대장 직접 테스트. 권한 요청 → 2초 녹음 → 자동 정지 → 미리듣기 재생까지 정상, 녹음 음질 양호.
- **iOS Safari: 미검증 (known-unverified risk)** — 주변 테스트 기기 부재. blocking 아님, Android-first beta로 진행 가능. P4-1B 실전송 전 가능하면 별도 확인 권장 (audio/mp4 fallback 경로가 실제로 타는지).
- **카카오 인앱 브라우저: 미검증 (선택 확인)** — MediaRecorder 미지원 시 unsupported 안내로 안전 강하하도록 구현되어 있음.
- P4-1A2 (2026-07-02): 대장 피드백 반영 — 신호 시트에서 음성 신호를 메인(상단 기본 펼침)으로, 이모지 신호를 접힘 보조 영역으로 재배치. 전송은 여전히 미구현.

## 9. 다음 지시 초안 (P4-1A용)

> P4-1A 실행. 2초 음성 신호 녹음 local preview만 구현한다.
> - 신호함 또는 사람 상세에 임시 진입점 1개(플래그로 숨김 가능하게).
> - MediaRecorder: isTypeSupported로 audio/webm;codecs=opus → audio/mp4 fallback. 미지원 브라우저는 버튼 숨김+안내.
> - 녹음 2초 자동 정지 + 카운트다운 UI + 미리듣기(재생 버튼, 자동재생 금지) + 취소/다시 녹음.
> - 전송/DB/Storage/푸시 금지. 서버 코드 금지. migration 금지.
> - 검증: 데스크톱 크롬 + (대장 실기기) iOS Safari·안드로이드 크롬·카카오 인앱에서 녹음/재생 확인 리포트.
> - verify-home-regression 14체크 PASS 유지.
