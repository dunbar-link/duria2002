전체 판정: PASS

# DUNBAR-LABEL-001 — 관계 5단계 라벨 정본화

- **작업일**: 2026-07-16
- **작업 식별자**: DUNBAR-LABEL-001-RELATION-STAGE-CANONICAL
- **대상 저장소**: `C:\work\nextjs-server`
- **브랜치**: `main`
- **사전 HEAD**: `f49b11a` (main == origin/main)
- **코드 commit hash**: `fff232d`
- **보고서 commit hash**: (이 commit)

---

## 1. 불일치가 있던 파일

Explore agent 전수 조사 결과, 저장 키/라벨 정합성 문제가 있던 파일:

| 파일 | 라인 | 문제 |
|---|---|---|
| `app/dashboard/_components/home/layer-color.ts` | 7-33, 40 | `LAYER_COLOR_MAP`의 150-tier 키가 `friendly`인데 실제 layout 키는 `maintain` (dead alias — fallback으로만 우연히 동작) |
| `app/dashboard/_components/home/home-entity-components.tsx` | 389 | `getLayerColor(layerId ?? "friendly")` fallback에 죽은 `friendly` 키 사용 |
| `app/invite/dashboard/page.tsx` | 117-123 | `getLayerIdByTier(150)` 반환값 `"friendly"` — localStorage/`layerBlueprints`의 `maintain`과 불일치 |
| `app/dashboard/people/add/page.tsx` | 13-17 | 라벨 스왑 버그: `15→친밀`, `50→신뢰`, `150→유지` — 다른 9개 파일 다수결(`15→신뢰`, `50→친밀`, `150→친근`)과 정면 충돌 |

주변 조사로 확인된 duplication (이번 task 범위 외 — 다음 ROI 후보):
- `getTierByLayerId` 3중 정의 (`home-page-utils.ts`, `page.tsx`, `invite/dashboard/page.tsx`)
- `getLayerLabelById` 2중 정의 (`page.tsx`, `invite/dashboard/page.tsx`)
- tier filter 컨벤션이 `people/page.tsx`만 `tier5/tier15/...` prefix로 다름

---

## 2. 기존 저장 키 5개 (유지)

| tier (정수) | LayerId (문자열, 유지) |
|---|---|
| 1 | `family` |
| 5 | `core` |
| 15 | `intimate` |
| 50 | `trust` |
| 150 | `maintain` |

- `friendly`는 실제 저장 키가 아닌 **dead alias** — 코드베이스 어디에서도 `layerId="friendly"` 상태가 정상적으로 저장되지 않음
- DB 저장은 layerId 문자열이 아닌 tier 정수(1/5/15/50/150)로만 이뤄짐 → 저장 키 변경 없음

---

## 3. 파일별 기존 한글 라벨 (15/50/150)

| 파일 | 위치 | 15 | 50 | 150 |
|---|---|---|---|---|
| `home-page-types.ts` (`layerBlueprints`, 사실상 정본) | L158-207 | 신뢰 | 친밀 | 친근 (maintain) |
| `page.tsx` (`getLayerLabelById`) | L321-327 | 신뢰 | 친밀 | 친근 |
| `invite/dashboard/page.tsx` (`getLayerLabelById`) | L125-131 | 신뢰 | 친밀 | 친근 |
| `invite/[token]/page.tsx` (`getTierLabel`) | L39-45 | 신뢰 | 친밀 | 친근 |
| `people/data.ts` (`getDashboardTierLabel`) | L110-117 | 신뢰 | 친밀 | 친근 |
| `people/page.tsx` (`getTierFilterLabel`, `getSimpleTierStyle`) | L227, 434 | 신뢰 | 친밀 | 친근 |
| `people/invite/page.tsx` (`tierOptions`) | L19-24 | 신뢰 | 친밀 | 친근 |
| `debug-beta/page.tsx` (`LAYER_DEFS`) | L79-85 | 신뢰 | 친밀 | 친근 |
| **`people/add/page.tsx` (`tierOptions`) — BUG** | L13-17 | **친밀** | **신뢰** | **유지** |

---

## 4. 확정한 정본 라벨과 근거

| tier | 저장 키 | **정본 라벨** | 근거 |
|---|---|---|---|
| 1 | `family` | 가족 | 전 파일 일치 (컨트로버시 없음) |
| 5 | `core` | 핵심 | 전 파일 일치 (컨트로버시 없음) |
| 15 | `intimate` | **신뢰** | 다수결 9:1 + `layerBlueprints` (정본) + 문서 `docs/beta-backlog-triage.md` L77 |
| 50 | `trust` | **친밀** | 다수결 9:1 + `layerBlueprints` + 문서 |
| 150 | `maintain` | **친근** | 다수결 10:1 + `layerBlueprints` + 문서 |

의미 정합성 확인:
- 각 라벨 겹치지 않음 (친밀 vs 친근 어감 명확히 다름)
- 관계 폭이 넓어질수록 라벨이 완만해짐 (가족 → 핵심 → 신뢰 → 친밀 → 친근)
- 영어 키 `intimate`(=친밀 뜻)이 한글 "신뢰"로, `trust`(=신뢰 뜻)이 "친밀"로 매핑되는 것은 프로덕트 정책이며 다수결·정본이 이 매핑을 지지 (이번 task는 이 매핑을 재정의하지 않음)

Canonical 정본 상수 추가:
- `app/dashboard/_components/home/home-page-types.ts`에 `LayerId` type / `LAYER_TIER_MAP` / `LAYER_LABEL_MAP` 새 export 추가
- 신규 코드는 이 상수를 import해서 사용하도록 유도
- 기존 중복 helper는 이번 task에서 리팩터링하지 않음 (과도한 변경 방지 — 다음 task 후보)

---

## 5. 저장 키·DB 변경 여부

- **저장 키 5개 유지** (변경 없음)
- **DB schema 변경 없음**: `dl_contact_people.tier`, `dl_edges.tier`, `dl_invites.tier`, `dl_graph_expansion_candidates.tier` 모두 여전히 integer(1/5/15/50/150)만 저장
- **API 페이로드 변경 없음**
- **localStorage 스키마 변경 없음**: `dunbar-link-home-layout-v16`의 layerId 문자열은 `maintain` 유지 (`friendly` alias는 애초에 저장된 적 없음)
- **기존 사용자 데이터 완전 호환**

---

## 6. 수정 파일

| 경로 | 변경 요약 | 순 변경 |
|---|---|---|
| `app/dashboard/_components/home/home-page-types.ts` | canonical `LayerId` / `LAYER_TIER_MAP` / `LAYER_LABEL_MAP` 신규 export | +24/-0 |
| `app/dashboard/_components/home/layer-color.ts` | `LAYER_COLOR_MAP.friendly` 키 → `.maintain`, `getLayerColor` fallback도 동일 | +7/-2 |
| `app/dashboard/_components/home/home-entity-components.tsx` | L389 fallback `"friendly"` → `"maintain"` | +1/-1 |
| `app/invite/dashboard/page.tsx` | L122 `getLayerIdByTier(150)` 반환 `"friendly"` → `"maintain"` | +1/-1 |
| `app/dashboard/people/add/page.tsx` | `tierOptions` 15/50 라벨 스왑 + 150 라벨 `"유지"` → `"친근"` | +3/-3 |

**합계**: 5 files, +36/-7

---

## 7. 주요 화면 검증

브라우저 자동 검증 시도:
- dev 서버 정상 기동 (`npm run dev` port 3000, Ready in 9.3s)
- `/dashboard/people/add` → 예상대로 auth 미들웨어가 `/login?next=%2Fdashboard%2Fpeople%2Fadd`로 307 redirect (auth 필요)
- `/login` → 200 응답 (렌더 정상)
- Claude Browser 뷰포트가 0x0으로 잡혀 시각 스크린샷은 제약. dev 서버 응답은 정상 확인.

관계 단계 라벨 노출 경로:
- 홈 우측 메타 라벨: `layerBlueprints.label` 소비 → 이번 task 정본과 이미 일치 (변경 없음)
- People 상단 tier chip: `getTierFilterLabel` → 이미 정본
- People 카드 tier 뱃지: `getSimpleTierStyle.label` → 이미 정본
- **사람 추가 form select**: `add/page.tsx` tierOptions → **이번 task로 수정 완료**
- 사람 초대 form select: `invite/page.tsx` tierOptions → 이미 정본
- 초대 수락 화면: `getTierLabel` → 이미 정본

수동 확인 필요 (auth 필요 페이지):
- 대장 실기기에서 `/dashboard/people/add` select에 `1가족 / 5핵심 / 15신뢰 / 50친밀 / 150친근` 순서로 뜨는지
- 홈 화면 우측 라벨과 People chip 라벨이 정본 순서 일치 확인

---

## 8. typecheck / lint / build / 테스트

| 검증 | 결과 | 비고 |
|---|---|---|
| `npx tsc --noEmit` | ✅ **PASS** | exit 0, 에러 없음 |
| `npm run lint` | **N/A** | Next 16에서 `next lint` deprecated. 내부 에러 메시지 출력하나 exit 0. Next 16 정책상 ESLint 직접 실행이 표준이며 프로젝트에 별도 script 없음 → 실패 처리 안 함 (지시 준수) |
| `npm run build` | ✅ **PASS** | 83 static pages 생성, edge runtime 경고만 (관계 라벨 무관) |
| `node scripts/verify-home-regression.mjs` | ✅ **14/14 PASS** | 홈/폴더 회귀 잠금 검수 완전 통과 |
| 관계 단계 전용 테스트 | 없음 | 프로젝트에 test runner 미설정. 대체 검증: code review + build + regression |

---

## 9. 기존 데이터 호환성

- 저장 키 5개 유지 → localStorage `dunbar-link-home-layout-v16`의 layerId 값 완전 호환
- DB tier 컬럼(정수) 완전 호환
- API 스키마 변경 없음
- `friendly`는 저장 키가 아닌 dead alias였으므로 유저 데이터에 `friendly` 값이 저장돼 있을 가능성 0
  - 안전 확인: `use-home-layout-storage.ts:422`의 `preferredOrder`는 `["maintain","trust","intimate","core","family"]` — `friendly` 없음
  - `layerBlueprints`도 `maintain`만 정의 — `friendly` 없음

---

## 10. commit hash

- **코드 commit**: `fff232d fix(labels): canonicalize relation tier labels (DUNBAR-LABEL-001)`
- **보고서 commit**: 이 파일이 담긴 별 commit (docs)

---

## 11. 원격 tip 일치

- push 전: local `main == origin/main == f49b11a` (동일, HEAD detached였음 → `git checkout main`으로 부착)
- push 후: local `main == origin/main == <new HEAD>` (fast-forward, 일치)
- push 대상: `origin main` (Vercel 자동배포 트리거)

---

## 12. 남은 위험

- **duplicate helper**: `getTierByLayerId` 3중 정의, `getLayerLabelById` 2중 정의가 남음 — 라벨은 이번 task로 모두 정본과 일치하지만 미래에 재발할 여지. 다음 task로 canonical 상수를 강제 사용하도록 리팩터링 권장
- **auth 필요 페이지 브라우저 시각 검증 미수행**: `/dashboard/people/add`의 실제 select 라벨을 대장이 로그인 후 확인 필요
- **tier chip 배열 순서**: 이번 task는 라벨만 다룸. 배열 순서(좁은→넓은 vs 넓은→좁은)는 파일별로 다르나 UI 목적에 맞아 통일하지 않음 — 필요 시 별 task
- **Vercel 자동배포**: main push로 자동배포 트리거됨. 배포 완료 확인은 사용자 read-only 확인 권장

---

## 13. ROI가 가장 높은 다음 작업 1개

**duplicate `getTierByLayerId` / `getLayerLabelById` 5개 정의를 canonical `LAYER_TIER_MAP` / `LAYER_LABEL_MAP` 사용으로 리팩터링**

- **근거**: 이번 task로 라벨은 정본 일치했지만 5개 duplicate 정의가 그대로 남아 미래에 재발 위험. canonical 상수가 이미 export됐으므로 얇은 함수 리팩터로 근본 방지 가능.
- **예상 파일**: 3개 (`home-page-utils.ts`, `page.tsx`, `invite/dashboard/page.tsx`)
- **예상 시간**: 30분 이내
- **위험도**: 🟢 낮음 (로직 변경 없음, 상수 참조만)
