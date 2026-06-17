# OTP 로그인 Phase 0 — 인증 인프라 준비

- 작성일: 2026-06-17
- 기준 커밋: 808f3bc (coin 실험 route production P0 차단 완료)
- 단계: OTP Phase 1 구현 **전** 인프라 준비. 앱 로그인 코드는 미구현.
- 관련 조사: 이메일 로그인·동기화 구조 조사 / P0 소유권 우회 재현 / OTP Phase 1 프리플라이트

## 요약

- `user_identity_links` migration 파일 작성 완료 (auth.users ↔ legacy dl-user-id 매핑 + RLS).
- **운영 DB 미적용** (CLI 운영 push 권한 불명확 → 파일·수동 명령만 준비, 적용 완료로 간주하지 않음).
- Supabase Email OTP: 로컬 `config.toml`은 6자리·1시간 확인. **production 대시보드 설정은 수동 확인 필요**.
- Phase 1 정책 확정: 인증 이메일과 Me 연락 이메일 분리, Phase 1 자동복사 없음(읽기전용 표시만).

## Migration

- 파일: `supabase/migrations/20260617_user_identity_links.sql`
- table: `public.user_identity_links`
- columns:
  - `id uuid pk default gen_random_uuid()`
  - `auth_user_id uuid not null references auth.users(id) on delete cascade`
  - `legacy_user_id text not null`
  - `status text not null default 'active' check (in ('active','revoked'))`
  - `created_at / updated_at timestamptz not null default now()`
- constraints:
  - `check (length(btrim(legacy_user_id)) > 0)` — 빈 legacy 금지
  - `unique (legacy_user_id)` — 한 legacy 는 한 계정만
  - `unique (auth_user_id, legacy_user_id)` — 조합 중복 금지
  - FK `auth_user_id → auth.users(id)` `on delete cascade`
- index: `idx_user_identity_links_auth_user_id`
- trigger: `user_identity_links_touch_updated_at` (기존 `public.dl_touch_updated_at()` 재사용; 의존: 20260302 migration)
- RLS: **활성화**. 이 프로젝트 최초의 RLS 테이블 (기존 테이블은 RLS 미사용·service_role 패턴 유지, 영향 없음)
  - SELECT/INSERT/UPDATE: `to authenticated`, `auth.uid() = auth_user_id`
  - DELETE: 정책 없음(임의 연결 해제 금지; 해제는 `status='revoked'` UPDATE 또는 service_role 운영 절차)
- migration 적용 여부: **미적용 (NOT APPLIED)**
- 적용 project: 미적용
- 적용 근거: 운영 DB push 권한·연결이 불명확하여 자동 적용하지 않음. 아래 수동 적용 절차 참조.

### 수동 적용 절차 (대장 또는 운영자)

방법 A — Supabase CLI (CLI 가 운영 project 에 link 돼 있고 access token 이 설정된 경우):

```bash
cd C:\work\nextjs-server
npx supabase db push          # 미적용 migration 을 운영 DB 에 반영
npx supabase migration list   # 적용 버전 확인
```

방법 B — Supabase Dashboard SQL Editor:

```
1) Supabase Dashboard → 해당 project → SQL Editor
2) supabase/migrations/20260617_user_identity_links.sql 내용 붙여넣기
3) Run
4) Database → Tables 에서 user_identity_links 와 RLS Enabled 확인
```

> 주의: 적용 전 `public.dl_touch_updated_at()` 함수가 운영 DB 에 존재해야 한다(dl_people 이 사용 중이므로 정상 환경엔 존재). 없으면 trigger 생성이 실패하므로 20260302 migration 적용 여부를 먼저 확인한다.

## 중복·보안 검증 (스키마/정책 정적 분석)

| 시나리오 | 결과 | 근거 |
| --- | --- | --- |
| legacy 중복 연결 차단 | PASS | `unique (legacy_user_id)` → 두 번째 INSERT 위반 |
| auth+legacy 중복 차단 | PASS | `unique (auth_user_id, legacy_user_id)` |
| 비인증 INSERT 차단 | PASS | RLS `to authenticated` (anon 차단) |
| 다른 auth_user_id INSERT 차단 | PASS | INSERT `with check (auth.uid() = auth_user_id)` |
| 다른 계정 SELECT 차단 | PASS | SELECT `using (auth.uid() = auth_user_id)` |

> 운영 실데이터 시험은 하지 않았다. 위는 SQL 제약·RLS 정책의 정적 분석 결과이며, 실제 동작 검증은 migration 적용 후 인증 세션으로 확인한다.

## Email OTP 설정 상태

### 로컬 config.toml (확인됨)

- `[auth] enabled = true`, `enable_signup = true`
- `[auth.email] otp_length = 6`, `otp_expiry = 3600`(1시간), `enable_confirmations = false`
- `[auth.rate_limit] token_verifications = 30 / 5분`, `email_sent = 2 / hour`(로컬은 inbucket)
- 로컬 `site_url = http://127.0.0.1:3000`

### production (대시보드 — 자동 확인 불가, 수동 필요)

`config.toml`은 **로컬 개발 전용**이다. 운영(`https://dunbar-link.vercel.app`)의 Auth 설정은 Supabase Dashboard 값이 적용되므로 아래를 수동 확인해야 한다.

| 항목 | 자동 확인 | 수동 확인 필요 |
| --- | --- | --- |
| Email provider 활성 | ❌ | ✅ Dashboard → Authentication → Sign In / Providers → Email = Enabled |
| 6자리 OTP 코드 방식 | ❌ | ✅ 이메일 템플릿에 `{{ .Token }}` 포함(코드 노출). 기본 템플릿은 magic link(`{{ .ConfirmationURL }}`)라 **코드 입력 방식이면 템플릿 수정 필요** |
| OTP 만료 | ❌ | ✅ Authentication → Email → OTP Expiry (기본 3600s) |
| 재전송/검증 rate limit | ❌ | ✅ Authentication → Rate Limits |
| Site URL | ❌ | ✅ Authentication → URL Configuration → Site URL = `https://dunbar-link.vercel.app` |
| Redirect URLs | ❌ | ✅ Redirect URLs 에 운영/dev URL 추가 (OTP 코드 방식은 redirect 의존이 낮지만 세션 안전을 위해 등록) |

### production 수동 체크리스트

```
[ ] Authentication → Providers → Email = Enabled
[ ] Email OTP 사용: 이메일 템플릿(Magic Link/Confirm)에 {{ .Token }} 추가해 6자리 코드 노출
    (magic link 링크 대신 코드 입력 방식으로 운영)
[ ] OTP Expiry = 3600s (또는 정책값) 확인
[ ] URL Configuration:
    Site URL       = https://dunbar-link.vercel.app
    Redirect URLs  = https://dunbar-link.vercel.app/* , http://localhost:3000/* (dev)
[ ] Rate Limits 확인 (email_sent / token_verifications)
[ ] 저장(Save) 후 화면 새로고침해 값 반영 확인
```

> 비밀키·SMTP credential 값은 본 문서에 기록하지 않는다. 실제 OTP 이메일은 발송하지 않았다.

## 인증 이메일 ↔ Me 연락 이메일 정책 (Phase 1 확정)

- **인증 이메일**: 계정 식별 및 OTP 로그인용. 계정 식별자.
- **Me 연락 이메일**: 프로필 연락 정보용(`me-profile-v3`의 `email`). 공개 제어 대상.
- 두 이메일은 **별도 개념**이며 값이 다를 수 있다.
- Phase 1 에서 인증 이메일을 Me 연락 이메일 필드에 **자동 복사하지 않는다**(계정별 localStorage 격리 전이라 혼합 위험 차단).
- Me 화면에 **로그인 이메일을 별도 읽기 전용으로 표시**하는 것은 Phase 1 에서 구현(연락 이메일 입력칸과 구분).
- 인증 이메일은 **자동 공개 금지**. 타 사용자 노출 경로 없음 유지.
- 로그아웃 후 인증 이메일이 익명 화면에 남지 않게 한다(세션·표시 제거).

## legacy ID 소유 증명 한계 (알려진 위험)

- `legacy_user_id`(dl-user-id)는 브라우저 localStorage 문자열이라, 그 값을 실제 소유했다는 **서버 측 암호학적 증명이 없다**.
- 완화책(Phase 1):
  - 자동 연결 금지 → 사용자가 명시적으로 "이 기기 데이터를 이 계정에 연결" 1회 선택
  - `unique(legacy_user_id)` → 이미 다른 계정에 연결된 legacy 는 재연결 차단
  - client 가 보낸 auth_user_id 불신 → 세션 `auth.uid()` 만 사용(RLS)
- **잔존 위험**: 공유 기기에서 타인이 먼저 로그인하면 그 기기의 legacy 를 자기 계정에 연결할 수 있다. 근본 해결은 legacy 와 묶인 서버 secret(예: 초대/신호 기반 일회용 토큰) 도입이 필요하며, 이는 Phase 1.5 후보로 분리한다.

## Phase 1 착수 조건

| 조건 | 상태 |
| --- | --- |
| migration 파일 준비 | ✅ 완료 |
| migration 운영 적용 | ⏳ **대장/운영자 수동 적용 필요** (미적용) |
| RLS 정책 정적 검증 | ✅ 완료 (적용 후 세션 실검증 필요) |
| production Email OTP 설정 | ⏳ **대시보드 수동 확인 필요** |
| production/dev URL 확인 | ⏳ 수동 확인 필요 |
| 앱 코드 미변경 | ✅ 본 단계 앱 코드 0 변경 |

**Phase 1 앱 구현(OTP 로그인·연결 API·Me 이메일 표시)은 위 ⏳ 3건이 완료된 뒤 착수한다.**

## 다음 단계

1. (대장/운영자) migration 운영 적용 + Email OTP 대시보드 설정 + URL 확인.
2. 완료 확인 후 Phase 1 앱 구현 지시문:
   - `app/login` OTP UI (이메일 → 6자리 코드 → 세션)
   - 계정 연결 API (`auth.uid` + legacy 1회 연결, 중복검사)
   - 연결 전 요약(개수만) / 로그아웃 / Me 로그인 이메일 읽기전용 표시
3. 사람·tier·Home 배치 서버 동기화는 Phase 2 로 계속 분리.
