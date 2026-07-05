# P4-PIVOT — 던바링크 제품 방향 전환 + SNS 간편로그인 테스트 경로

- 작성일: 2026-07-02
- 기준: P4-1B 음성 실전송 완료(7b91b57) + migration 적용 검증 PASS

## 1. 새 제품 방향

**"150명 안의 믿을 수 있는 지인에게 2초 음성·2초 영상을 보내는 짧은 관계 신호 앱"**

- 카톡은 대화, 던바링크는 2초 신호.
- 가까운 사람에게 짧게 살아있음을 남겨요.
- 길게 말하지 않아도 관계는 이어져요.
- 믿을 수 있는 사람에게만 보내는 짧은 목소리와 표정.

원칙:
- 음성/영상은 **대화가 아니라 짧은 생존 신호**다. 답장 스레드·긴 녹음·채팅 확장 금지.
- **24시간 후 사라지는 ephemeral 정책 유지**(P4-1B 대장 확정).
- 기존 emoji signal 은 **보조 기능**으로 유지(삭제 아님).
- 인맥 탐색(2촌/3촌/브릿지)은 **후순위** — 사용자가 많아진 뒤 재개.
- 2초 영상은 **P4-2에서 별도 설계**(이번엔 준비중 버튼만).
- 수익화 방향은 미확정. 단, "2초 신호 앱"이 사용자 이해도가 더 높다는 판단.
- Home / People / Me 는 현 상태 유지. **사람 상세페이지가 "2초 신호방"의 중심.**

## 2. 상세페이지 = 2초 신호방 (P4-PIVOT 구현)

- 상단: 이름/관계 tier/연결 상태(기존 헤더 유지) + "2초 신호를 보내는 사람" 한 줄.
- 중앙: **2초 신호방 카드** — 채팅방처럼 보이는 최근 신호 기록(보낸 신호 오른쪽/받은 신호 왼쪽 말풍선, 텍스트 입력 없음). voice row 는 ▶ 듣기(서명 URL 재생, 자동재생 금지), emoji 는 작은 말풍선. empty: "아직 주고받은 2초 신호가 없어요 / 짧게 목소리를 남겨보세요".
- 액션 우선순위: **🎙️ 2초 음성(메인, 인라인 녹음→미리듣기→보내기)** > 🎥 2초 영상(준비중 안내만) > 😊 이모지(기존 시트 호출, 보조).
- 미연결 상대: 음성 버튼 비활성 + "연결된 친구에게만 보낼 수 있어요".
- 전송은 기존 P4-1B `/api/signals/voice` 재사용(수신자 = 상세 대상 1명 고정, 서버가 세션·연결 재검증).
- 기존 "신호 보내기" 큰 버튼 카드 → 제거(이모지 시트는 😊 버튼으로 이동), 3일 보류는 슬림 보조 버튼으로 축소.
- 표시 이름/기본 정보 카드는 하단 보조 영역 그대로.

## 3. 테스트 제약과 대안 (중요)

대장 상황: **핸드폰 1대 + 카카오 계정 1개** → 두 폰 E2E 불가.

| 역할 | 기기 | 계정 |
|---|---|---|
| 계정 A (보내는 쪽) | 폰 (Android Chrome) | 카카오 로그인 |
| 계정 B (받는 쪽) | PC Chrome | **다른 이메일로 OTP 로그인** (이미 구현돼 있어 바로 가능) |

- 같은 브라우저·같은 계정으로는 E2E 불가. PC는 폰과 다른 계정이어야 한다.
- push 테스트는 폰/PC 각각 대시보드 "알림" 버튼으로 구독을 켜야 한다.
- 푸시가 어려우면 신호함 새로고침(realtime 자동 갱신)으로 1차 확인 가능.
- 이메일 OTP 제약: Supabase 기본 SMTP 는 시간당 발송 2건 제한 — 로그인 시도를 아껴서 사용.

## 4. 현재 auth 구조 (read-only 조사 결과)

- 로그인 수단: **카카오(Supabase OAuth provider)** + **이메일 OTP**(`signInWithOtp`, 6자리) — `app/login/login-form.tsx`.
- 콜백: `app/auth/callback/route.ts` — `exchangeCodeForSession(code)`, 상대경로만 허용(오픈 리다이렉트 차단).
- 로그인 직후 `POST /api/account/identity-link` 로 기기 legacy id(`dl-user-id`)를 `user_identity_links`(RLS: 본인만)로 연결. 201/200 → dashboard, 409(다른 계정에 연결됨) → 자동 로그아웃.
- 보호: middleware 없음, `app/dashboard/layout.tsx` 가 `auth.getUser()`로 게이트.
- Me: 프로필 카드 안 `AccountSection`(이메일 + 연결 배지 + 로그아웃) 기존 존재. P4-PIVOT 에서 하단에 "계정 · 간편로그인" 접힘 카드 추가(현재 로그인 방식 + 테스트 2계정 안내 + provider 상태 chip — 활성 OAuth 버튼 없음).

## 5. 네이버 로그인 판단

**Supabase Auth 는 Naver 를 공식 provider 로 지원하지 않는다** (지원 목록: apple/azure/google/github/kakao 등 — naver 없음).

구현하려면: Naver Developers 앱 등록 + Client ID/Secret + callback URL + 자체 OAuth 중개(state/nonce/CSRF 처리) + auth.users 수동 연결 — 보안 부담 크고 P4 음성 E2E 를 지연시킨다.

**판정: A안 + D안 조합.**
- 지금 테스트 목적 = **D안: 이메일 OTP** (이미 구현, 설정 0개, 즉시 사용).
- SNS 추가가 필요해지면 = **A안: Google 먼저** (Supabase 공식 지원, 아래 §6).
- **Naver 는 보류** — 실사용자 온보딩에서 네이버 수요가 확인되면 P5 로 별도 설계(B안). 임시 하드코딩/우회 구현 금지.

## 6. Google 로그인 추가 경로 (action-needed, 별도 승인)

Supabase 공식 지원이라 코드 변경은 작다. 단, **외부 설정이 선행**돼야 한다:
1. [대장] Google Cloud Console 에서 OAuth Client 생성(Client ID/Secret) — redirect URI 는 Supabase 콜백 URL.
2. [대장] Supabase Dashboard → Authentication → Providers → Google 활성화 + ID/Secret 입력.
3. [Claude] `login-form.tsx` 에 Google 버튼 추가(`signInWithOAuth({ provider: "google" })` — 카카오 버튼과 동일 패턴) + 프로필 추출(`lib/auth/kakao-profile.ts` 패턴).
- env/secret 이 준비되기 전에는 구현하지 않는다(이번 작업에서도 미구현).

## 7. 이번(P4-PIVOT)에 하지 않은 것

- 네이버/Google OAuth 실제 구현 (설정 부재 — §5/§6)
- 2초 영상 실구현(getUserMedia video/녹화/업로드/스키마 전부 금지 준수 — 준비중 버튼만)
- 계정 자동 병합/identity 병합
- push send 인증 보강(P4-1C) / cleanup 배치(P4-1D) / Point 정책(P4-1E)
- 인맥 탐색/친구 검색

## 7-1. P4-1D 만료 cleanup + "한 번 들으면 사라짐" 정책 (2026-07-04)

**"들으면 사라짐" 현상의 실체 (코드 확인 결과):**
- 재생(voice-url GET)은 **DB row 도 Storage object 도 삭제하지 않는다.** 삭제는 수동 삭제(✕/DELETE route)와 만료 cleanup 뿐.
- 실제 원인: ① signed URL TTL 120초 — 재생 후 시간이 지나면 그 audio 는 다시 못 틀고, 화면 재진입 시 "▶ 듣기" 버튼으로 돌아감. ② 상세 신호방은 최근 5건만 표시 — 새 신호가 오가면 이전 음성이 목록에서 밀려남.
- 판정: **우발적 UX(의도된 삭제 아님).** 단, 대장이 이 "한 번 듣고 사라지는 느낌"을 좋다고 판단 → **UX 로는 허용/유지**. 실데이터는 24시간 만료까지 보존되고 그 후 cleanup 이 지운다. "1회 재생 즉시 실제 삭제"는 이번 MVP 에서 구현하지 않음(향후 제품 결정 시 별도).

**cleanup 구현:**
- 대상: `type='voice' AND expires_at < now` 만. emoji/미만료 voice 는 절대 미대상.
- 수동: `node scripts/p4-1d-cleanup-expired-voice-signals.mjs` (기본 dry-run, `--apply` 로만 실제 삭제).
- 자동: `GET /api/cron/voice-cleanup` — `Authorization: Bearer CRON_SECRET` 필수, env 없으면 503. vercel.json cron 매일 01:00 UTC(10:00 KST).
- 순서(멱등): storage object 삭제 성공 배치만 row 삭제, 실패 배치는 다음 실행 재시도. orphan object 도 회수됨.
- **action-needed**: Vercel 프로젝트 env 에 `CRON_SECRET` 추가(임의 긴 랜덤 문자열) — 추가 전까지 cron 은 503 으로 안전 비활성.

## 7-2. P4-1C push 발송 인증 보강 (2026-07-05)

- `/api/push/send` 는 **로그인 세션 필수**(401). client 가 보낸 receiverIds 는 신뢰하지 않고, **dl_invites(accepted) 연결 상대만** 서버가 걸러서 발송(전부 미연결이면 403). 발송은 내부 helper(lib/push/send-push.ts) 재사용 — 404/410 만료 구독 정리가 이 경로에도 적용됨.
- payload 위생: title 80자/body 200자 제한, url 은 내부 경로(`/...`)만 허용(외부 URL 푸시 금지).
- deprecated `/api/api/push/send` 는 308 redirect 유지 — 최종 목적지가 인증을 요구하므로 추가 조치 불요.
- 기존 이모지 신호 push 호출부(홈/신호함/상세)는 로그인 same-origin fetch 라 그대로 동작. voice push 는 원래 내부 helper 직행이라 무영향.
- [P4-1C-b 완료 — 2026-07-05] `/api/push/subscribe` 인증 보강: 로그인 세션 필수(401) + 저장하려는 userId 가 내 세션 legacy/auth id 집합에 속할 때만 허용(403, 400=형식오류). 타인 user_id 로 endpoint 등록/하이재킹 차단. 저장 user_id 값은 legacy dl-user-id 그대로 유지(send 조회 좌표계 보존). 구독 호출부(dashboard + invite/dashboard 의 `subscribePushForUser`)는 로그인 상태면 그대로 동작, 비로그인이면 subscribe 가 false 반환으로 조용히 실패(핵심 흐름 무영향). 잔여 미세 리스크: 공격자가 피해자의 secret endpoint URL 을 이미 알 경우 자기 user_id 로 그 endpoint 를 덮어써 피해자 구독을 무효화할 수 있으나(endpoint 는 추측 불가한 비밀), 임의 userId 등록은 이제 불가.
- P4-1D cron 활성 조건: 코드(`process.env.CRON_SECRET`)와 vercel.json crons 는 준비 완료 — **대장이 Vercel env 에 CRON_SECRET 추가 + 이번 P4-1C 자동배포**부터 적용 가능. cron 200 은 Vercel Dashboard → Cron 로그에서 확인.

## 7-3. P4-1C-c 실사용 회귀 — 근본원인 & 수정 (2026-07-05)

**확정 근본원인(read-only DB 진단): 한 계정이 legacy dl-user-id 를 여러 개 가진다.**
- 기기/세션/시크릿창마다 `getCurrentUserId()` 가 새 `dl-user-…` 를 만들고, 로그인 시 각각 `user_identity_links` 로 같은 auth 계정에 묶인다. 진단상 대장 계정 = auth 1개에 legacy **4개**(b3970c/6bdf67/14025c/f143fb), PC 계정 = legacy 2개(ff0f6e/3d0d5b).
- 신호 `receiver_id`, push 구독 `user_id`, dl_invites 의 id 가 **같은 계정의 서로 다른 legacy id 로 어긋나면** "보냈는데 상대 화면/알림에 안 잡히는" 비대칭이 생긴다.

**증상별 원인**
- push 미수신: 상대가 addressed 된 legacy id 로 구독돼 있지 않음(다른 기기 id 로 구독했거나 미구독). send 는 단일 receiver id 로만 push_subscriptions 를 조회 → 못 찾음.
- red-dot 비대칭: 수신 unread 를 `getCurrentUserId()` 단일 id 로만 계산 → 상대가 내 다른 legacy id 로 보낸 신호를 놓침.
- Home 연결 누락(강병구연결1): 미해결 — 상세는 P4-sync 로 분리(아래).

**이번 수정(서버 사이드, Home 레이아웃/회귀 잠금 무접촉)**
- `lib/push/send-push.ts`: 발송 전 receiverIds 를 `user_identity_links` 로 **계정 전체 legacy id 집합으로 확장** 후 push_subscriptions 조회 → 어느 기기에 구독돼 있든 그 사람의 모든 기기에 알림. voice/emoji push 양쪽 적용. (같은 계정 내 확장이라 타인 유출 없음.)
- `GET /api/me/unread-senders`(신규) + `readUnreadReceivedSenderIds`: 세션의 모든 legacy/auth id 로 받은 미확인 신호 sender 를 계산. Home 빨간점 3개 호출부가 자동으로 계정 인식(레이아웃 코드 무변경). 실패 시 단일 id 쿼리로 폴백. (realtime 라이브 필터는 여전히 단일 id — 새로고침/mount backfill 에서 계정 전체 반영. 완전 라이브화는 P4-sync.)

**미해결 → 분리**
- [P4-1C-d] push runtime: PC(ff0f6e/3d0d5b)는 진단상 push_subscriptions row 자체가 없음 → 실제 구독 성공 여부(권한 grant + subscribe 200)를 기기에서 확인해야 함.

## 7-4. P4-sync 완료 — Home/People 연결 hydration 계정 전체 id 화 (2026-07-05)

**근본원인**: `GET /api/invites/mine` 이 권한 검증(`session.legacyIds`)은 계정 전체 id 로 하면서, 실제 DB 조회(`dl_invites.or(inviter_user_id.eq.userId, accepted_person_id.eq.userId)`)는 client 가 보낸 **단일** `userId`(`getCurrentUserId()`, 기기 로컬)로만 했다. push/unread(P4-1C-c)는 이미 계정 전체 id 로 고쳐졌지만 이 route 는 남아 있었다. 그래서 accepted 연결이 **다른 legacy id**(다른 기기/세션)로 맺어져 있으면 이 기기의 Home/People sync 가 그 row 자체를 못 받아왔다.

**수정**
- `app/api/invites/mine/route.ts`: DB 쿼리를 `session.legacyIds` 전체 집합으로 확장(`inviter_user_id.in.(...), accepted_person_id.in.(...)`), 응답에 `myIds`(계정 전체 legacy id 목록) 추가.
- `app/dashboard/people/store.ts` (`syncAcceptedInvitesToPeople`): 응답 row 가 "나 자신(내 다른 legacy id)"인지 "상대"인지 판정하던 기존 `=== currentUserId` 단일 비교를 전부 `selfIds`(myIds + currentUserId) 집합 기반으로 교체. 안 그러면 서버가 계정 전체로 확장된 뒤 내 다른 legacy id 가 낀 row 를 상대로 오인해 유령 person 이 생기거나 반대로 여전히 못 잡는 문제가 생김.
- `app/dashboard/people/page.tsx` (`mergedPeopleSource`): 동일하게 `isSelfPerson`/accepted_person_id skip 판정을 `myIds` 기반 `selfIds` 집합으로 교체. Home(store)과 People 이 같은 self 판정 기준을 쓰도록 통일 — 사람 수 불일치 방지.
- Home UI, People UI, 폴더/슬롯 배치, dedup key(`user:<id>` / `id:<id>`) 로직은 무변경. 기존 local person 덮어쓰기·중복 생성 방지 로직 그대로 재사용.

**검증**: `npx tsc --noEmit` PASS, `npm run build` PASS, `node scripts/verify-home-regression.mjs` 14/14 PASS, 로컬 dev 서버에서 `/api/invites/mine`·`/api/push/send`·`/api/push/subscribe` 무인증 401 확인.

## 7-5. P4-1C-d 완료 — 알림 ON 표시 신뢰성 + 자동 재등록 (2026-07-05)

**근본원인**: Home/직행 대시보드의 "알림 ON" 표시가 `Notification.permission === "granted"`만 보고 켜졌다. 실제 `push_subscriptions` row 가 서버에 존재하는지는 전혀 확인하지 않았고, mount 시 권한이 이미 granted 면 재구독 시도 자체가 없었다. 그래서 (1) 최초 가입 이후 subscribe 가 한 번도 성공하지 못했거나 (2) P4-1C-b 인증 보강 이후 client 로컬 id 가 세션 legacy id 집합과 어긋나 subscribe 가 403 으로 실패했어도, 화면은 계속 "알림 ON"으로 보여 대장이 다시 누를 신호가 없었다. push send 자체(`sendPushToUsers`/`expandToAccountIds`)는 P4-1C-c 에서 이미 계정 전체 id로 정상 확장돼 있어 문제 없었음 — 구독 row 부재/불일치가 원인.

**수정**
- `GET /api/me/push-status`(신규): 로그인 세션 필수. 계정 전체 legacy id(`session.legacyIds` + `authUserId`) 기준으로 `push_subscriptions` row count 와 최신 `updated_at` 만 반환(endpoint/키 값 절대 미노출).
- `lib/push/push-client.ts`: `getPushSubscriptionStatus()` 추가(위 route 호출 helper, 실패 시 null).
- `app/dashboard/page.tsx`, `app/invite/dashboard/page.tsx`: mount effect를 "permission granted → 서버 subscriptionCount 확인 → 0이면 조용히 재구독(`subscribePushForUser`)" 흐름으로 교체. client 로컬 id가 서버가 내려준 `myIds` 집합에 없으면(불일치) 서버 쪽 id를 우선 사용해 subscribe. subscriptionCount > 0 이면 불필요한 재구독 없이 바로 ON.
- push send/subscribe 무인증 401은 그대로 유지, 새 route도 동일하게 401 필수.

**검증**: `npx tsc --noEmit` PASS, `npm run build` PASS, `verify-home-regression.mjs` 14/14 PASS, 로컬에서 `/api/push/send`·`/api/push/subscribe`·`/api/me/push-status` 무인증 401 확인, `p4-1d-cleanup-expired-voice-signals.mjs` dry-run 0건.

**남은 것(대장 실기기 확인 필요)**: 이번 수정은 "권한은 있는데 구독 row가 없던" 케이스를 새로고침 시 자동으로 치유한다. PC/모바일에서 새로고침 후에도 여전히 미수신이면 브라우저/OS 알림 차단(권한 자체가 거부됨) 또는 VAPID env 문제로 좁혀서 재진단 필요.

## 7-6. P4-1C-e 완료 — 이모지 push 경로 정렬 + PC 알림 버튼 상태 (2026-07-05)

**근본원인 1(이모지 push FAIL, 음성은 PASS)**: `/api/push/send`의 연결 검증이 "나"(session 전체 legacy id)는 `myIds`로 넓게 매칭했지만 "상대"(client가 보낸 `receiverIds`)는 그대로 좁게 매칭했다. 상대 계정도 legacy id를 여러 개 가질 수 있어(P4-1C-c와 동일 원인) 상대가 최근 다른 기기/세션에서 갱신된 legacy id로 dl_invites row가 박혀 있으면 이 좁은 매칭이 그 row를 못 찾고 403(`not_connected`)이 난다. 음성(`/api/signals/voice`)의 `findConnection`도 구조적으로 동일한 취약점이 있었지만 이번 테스트 케이스에서는 우연히 매칭됐을 뿐 — 근본적으로는 같은 계열 문제.
**근본원인 2(조용한 실패)**: 이모지 신호(`sendSignal`)는 client가 anon key로 직접 `signals` insert하는 완전히 별도 경로이고, push 발송은 그 뒤에 `void fetch("/api/push/send", ...)`로 완전히 fire-and-forget — 응답 상태를 전혀 확인하지 않아 401/403/500이 나도 콘솔에조차 안 남았다. "신호는 갔는데 알림만 안 옴" 증상이 재현 불가능한 상태로 방치됨.
**근본원인 3(PC 버튼 무반응)**: `Notification.permission === "denied"`(브라우저에서 알림 차단)일 때 `subscribePushForUser`가 아무 표시 없이 false만 반환 — 버튼을 눌러도 상태/문구가 그대로라 "기능이 없는 것처럼" 보였다.

**수정**
- `lib/push/send-push.ts`: 기존 `expandToAccountIds`(private)를 `export`로 전환해 재사용.
- `app/api/push/send/route.ts`: 연결 검증 전에 client가 보낸 `requestedIds`도 `expandToAccountIds`로 계정 전체 id로 확장 후 dl_invites 매칭(`myIds`처럼 양쪽 다 넓게 봄).
- `lib/push/push-client.ts`: `sendSignalPush(receiverIds, emoji, url?)` 신규 — `/api/push/send` 응답을 반드시 확인하고 실패 시 `console.error`로 남긴다(신호 전송 자체는 막지 않음, `sendSignal` 로직 무변경).
- `app/dashboard/page.tsx` / `app/dashboard/people/[id]/person-detail-client.tsx` / `app/invite/dashboard/page.tsx`: 이모지 push 발송 3곳의 `void fetch(...)`를 전부 `void sendSignalPush(...)`로 교체.
- PC/모바일 알림 버튼: `Notification.permission === "denied"`를 별도 `notificationBlocked` 상태로 분리해 "알림"/"알림 ON"/"알림 차단됨" 3단으로 표시. 클릭 시 차단 상태면 즉시 반영(+ dashboard/page.tsx는 기존 cap-차단 토스트를 재사용해 "브라우저 설정에서 알림을 허용해 주세요" / "알림 등록을 다시 시도해 주세요" 짧은 안내). 버튼 위치/디자인 무변경, 문구만 보강.

**검증**: `npx tsc --noEmit` PASS, `npm run build` PASS, `verify-home-regression.mjs` 14/14 PASS, 로컬에서 `/api/push/send`·`/api/push/subscribe`·`/api/me/push-status` 무인증 401 확인. 실제 실기기 2계정 왕복 발송 테스트는 대장 확인 필요(로그인 세션이 있어야 검증 가능한 영역).

## 8. 다음 단계 후보

1. **P4-E2E**: 폰(카카오) ↔ PC(이메일 OTP) 음성 신호 왕복 테스트 — 지금 바로 가능.
2. **P4-2**: 2초 영상 신호 설계(용량/포맷/iOS 카메라/스토리지 비용부터 감사).
3. **P4-1C**: /api/push/send 인증 보강 + emoji push 호출부 내부 helper 전환.
4. **P4-1D**: 만료 신호 cleanup 배치.
5. **P5 후보**: Google 로그인(외부 설정 후) → Naver(수요 확인 시).
