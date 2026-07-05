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
- [잔여 리스크 — P4-1C-b 후보] `/api/push/subscribe` 는 여전히 무인증(userId 를 body 로 받음) — 타인 user_id 에 자기 endpoint 를 붙여 그 사람의 푸시를 가로챌 수 있는 구조. 즉시 보강하지 않은 이유: 비로그인 상태의 invite dashboard 구독 흐름을 깨뜨릴 수 있어 별도 확인 후 진행 필요.
- P4-1D cron 활성 조건: 코드(`process.env.CRON_SECRET`)와 vercel.json crons 는 준비 완료 — **대장이 Vercel env 에 CRON_SECRET 추가 + 이번 P4-1C 자동배포**부터 적용 가능. cron 200 은 Vercel Dashboard → Cron 로그에서 확인.

## 8. 다음 단계 후보

1. **P4-E2E**: 폰(카카오) ↔ PC(이메일 OTP) 음성 신호 왕복 테스트 — 지금 바로 가능.
2. **P4-2**: 2초 영상 신호 설계(용량/포맷/iOS 카메라/스토리지 비용부터 감사).
3. **P4-1C**: /api/push/send 인증 보강 + emoji push 호출부 내부 helper 전환.
4. **P4-1D**: 만료 신호 cleanup 배치.
5. **P5 후보**: Google 로그인(외부 설정 후) → Naver(수요 확인 시).
