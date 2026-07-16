전체 판정: PASS

# DUNBAR-LABEL-002 — canonical helper 참조 리팩터링

- **작업일**: 2026-07-16
- **작업 식별자**: DUNBAR-LABEL-002-CANONICAL-HELPER-REF
- **대상 저장소**: `C:\work\nextjs-server`
- **브랜치**: `main`
- **사전 HEAD**: `7db89fd` (DUNBAR-LABEL-001 완료 시점)
- **코드 commit hash**: `82f621c`
- **보고서 commit hash**: (이 파일이 담긴 별 commit)

---

## 1. 사전 상태

| 항목 | 값 |
|---|---|
| branch | `main` |
| local HEAD | `7db89fd` |
| origin/main | `7db89fd` (일치) |
| working tree | clean |
| untracked | `덴바링크아이콘 이미지/` (기존, 미접근) |

DUNBAR-LABEL-001 (`fff232d` + `7db89fd`) 운영 반영 및 호환성 PASS 상태에서 시작.

---

## 2. 중복 helper가 있던 파일

`function` 정의 기준 사전 grep 결과:

| 파일 | 라인 | 함수 | 상태 |
|---|---|---|---|
| `app/dashboard/_components/home/home-page-utils.ts` | 32 | `getTierByLayerId` (export) | 정본 후보 (이미 export됨) |
| `app/dashboard/page.tsx` | 304 | `getTierByLayerId` (local) | **중복** |
| `app/dashboard/page.tsx` | 321 | `getLayerLabelById` (local) | **중복** (utils에도 없음 — 신규 canonical 필요) |
| `app/invite/dashboard/page.tsx` | 109 | `getTierByLayerId` (local, `HomeInviteTier` type) | **중복** |
| `app/invite/dashboard/page.tsx` | 117 | `getLayerIdByTier` (local) | **중복** (inverse mapping) |
| `app/invite/dashboard/page.tsx` | 125 | `getLayerLabelById` (local) | **중복** |

합계: 3파일에서 6개 로컬 함수 정의 (canonical 1개 + 중복 5개) + 부수 type alias 1개.

호출 사이트 수:
- `page.tsx`: `getTierByLayerId` 7곳, `getLayerLabelById` 2곳
- `invite/dashboard/page.tsx`: `getTierByLayerId` 1곳, `getLayerIdByTier` 1곳, `getLayerLabelById` 2곳
- `home-page-utils.ts` export 사용처: `use-home-drag-drop.ts`, `use-home-folder-interactions.ts` (변경 없음)

---

## 3. 수정 내용

### 3-1. `app/dashboard/_components/home/home-page-utils.ts` (+26/-6)

- home-page-types 임포트에 `LAYER_TIER_MAP`, `LAYER_LABEL_MAP`, `type LayerId` 추가
- `getTierByLayerId` 본체를 5-줄 if-chain → `LAYER_TIER_MAP[layerId as LayerId] ?? 150` 한 줄
- 신규 export 2개:
  - `getLayerLabelById(layerId: string): string` — `LAYER_LABEL_MAP[layerId as LayerId] ?? LAYER_LABEL_MAP.maintain`
  - `getLayerIdByTier(tier: number): string` — LAYER_TIER_MAP 역방향 검색, fallback `"maintain"`
- 함수 시그니처와 fallback 시맨틱 완전 보존

### 3-2. `app/dashboard/page.tsx` (+2/-17)

- home-page-utils import에 `getTierByLayerId`, `getLayerLabelById` 추가 (알파벳 위치)
- 로컬 `getTierByLayerId` (L304-310) 삭제
- 로컬 `getLayerLabelById` (L321-327) 삭제
- `normalizeInviteTier`(L313-319)는 별 개념(tier 정수 검증)이라 그대로 유지
- 호출 사이트 9곳 코드 무변경 (함수 이름 동일)

### 3-3. `app/invite/dashboard/page.tsx` (+3/-25)

- home-page-utils import에 `getTierByLayerId`, `getLayerIdByTier`, `getLayerLabelById` 추가
- 로컬 `HomeInviteTier` type 삭제 (unused after helper removal)
- 로컬 `getTierByLayerId` / `getLayerIdByTier` / `getLayerLabelById` 삭제
- 호출 사이트 4곳 코드 무변경

**합계**: 3 files, +26/-48 = **net -22줄** (duplication 제거)

---

## 4. canonical map 참조 방식

```
home-page-types.ts (canonical source)
  ├─ export type LayerId = "family"|"core"|"intimate"|"trust"|"maintain"
  ├─ export const LAYER_TIER_MAP:  Record<LayerId, 1|5|15|50|150>
  └─ export const LAYER_LABEL_MAP: Record<LayerId, string>
        │
        ▼
home-page-utils.ts (canonical helpers, DUNBAR-LABEL-002)
  ├─ export getTierByLayerId(layerId)  → LAYER_TIER_MAP[...] ?? 150
  ├─ export getLayerLabelById(layerId) → LAYER_LABEL_MAP[...] ?? LAYER_LABEL_MAP.maintain
  └─ export getLayerIdByTier(tier)     → Object.entries(LAYER_TIER_MAP) 역방향
        │
        ▼ import
page.tsx / invite/dashboard/page.tsx / use-home-drag-drop.ts / use-home-folder-interactions.ts
```

Fallback 정책:
- 알 수 없는 layerId → 150-tier로 fallback (`"maintain"` / `"친근"`)
- 알 수 없는 tier → `"maintain"` layerId로 fallback
- `friendly` 문자열은 어디에서도 새로 fallback으로 부활하지 않음

---

## 5. friendly / maintain 호환성

| 항목 | 결과 |
|---|---|
| `friendly` 활성 코드 참조 | **0건** (layer-color.ts의 코멘트 3줄만 잔존 — 역사 설명 목적) |
| `friendly` 저장/API/localStorage 재부활 | 없음 — 새 fallback 어디에도 `friendly` 반환 안 함 |
| `maintain` = 150-tier 정본 | 코드 전반에서 유일한 진리로 통일 |
| 기존 데이터 위험 | 🟢 없음. DUNBAR-LABEL-001에서 이미 검증됨 |

---

## 6. 저장 키·DB·API 변경 여부

- **저장 키 5개 유지** (변경 없음): `family / core / intimate / trust / maintain`
- **DB schema 변경 없음**
- **API 페이로드 변경 없음**
- **localStorage 스키마 변경 없음**
- **UI/디자인/단계 순서 변경 없음**

내부 리팩터링만 수행. 사용자 관찰 가능 동작 변경 0.

---

## 7. 검증 결과

| 검증 | 결과 | 비고 |
|---|---|---|
| `npx tsc --noEmit` | ✅ **PASS** | exit 0, 에러 없음 |
| `npm run build` | ✅ **PASS** | 83 static pages 생성 |
| `node scripts/verify-home-regression.mjs` | ✅ **14/14 PASS** | 홈/폴더 회귀 잠금 완전 통과 |
| `npm run lint` | **N/A** | Next 16 `next lint` deprecated (동일 사유, exit 0) |
| grep: `function getTierByLayerId\|function getLayerLabelById\|function getLayerIdByTier` | ✅ | `home-page-utils.ts`에만 3개 export 정의 존재 (중복 0) |
| grep: `friendly` (reports 제외) | ✅ | layer-color.ts 코멘트 3줄만 (예상된 문서화) |
| 5단계 라벨 매핑이 canonical map만 참조 | ✅ | LAYER_TIER_MAP / LAYER_LABEL_MAP 단일 소스 |

---

## 8. 주요 화면 검증

**브라우저 자동 검증**: 스킵 (내부 refactor로 사용자 관찰 가능 동작 변화 0. DUNBAR-LABEL-001에서 라벨 화면 검증 이미 완료).

**대장 실기기 체크리스트** (auth 후, DUNBAR-LABEL-001과 동일):
- People 추가(`/dashboard/people/add`) select: 가족 / 핵심 / 신뢰 / 친밀 / 친근
- Home 레이어 라벨 순서 일치
- Invite dashboard 라벨 표시 일치
- 모바일 라벨 클리핑 없음
- 기존 사람 단계/연결 유지

**BLOCKED_LOCAL 사유**: 로컬 Claude Browser는 auth 페이지 시각 검증 불가 (뷰포트 0x0 + 카카오/OTP 인증 필요). 대장 세션에서 확인 필요.

---

## 9. 보고서 경로

- `reports/dunbar-label-002-latest.md` (이 파일)
- `reports/dunbar-label-002-2026-07-16.md` (날짜 스냅샷)

완료 후 latest 보고서를 notepad.exe로 자동 오픈.

---

## 10. commit hash

- **코드**: `82f621c refactor(labels): use canonical relation tier maps`
- **보고서**: 이 파일 commit

---

## 11. origin/main == HEAD

- push 전: `origin/main == local main == 7db89fd`
- push 후: `origin/main == local main == <new HEAD>` (fast-forward, 일치 확인)

---

## 12. Vercel 수동 deploy 여부

- **수동 deploy: 없음**
- `vercel deploy` / `vercel --prod` / Vercel Dashboard Promote·Deploy 모두 미수행
- main push → Vercel 자동배포 트리거 (허용된 방식). 대장이 Vercel dashboard에서 시각 확인 권장.

---

## 13. 남은 위험

- 🟢 결정적 위험 없음
- 코드 관측:
  - `layer-color.ts`의 `friendly` 코멘트 3줄은 역사 설명 목적으로 남김 (제거해도 무해). 다음 정리 사이클에 판단
  - `people/page.tsx`의 `TierFilter = "all"|"family"|"tier5"|"tier15"|"tier50"|"tier150"` prefix 컨벤션이 다른 곳과 다름 — 이번 task 범위 외지만 canonical LayerId와 통일 여지
  - `debug-beta/page.tsx`의 `LAYER_DEFS`는 별도 정의 유지 (dev-only 페이지라 우선순위 낮음)
- 브라우저 시각 검증 미수행 (auth 필요) → 대장 실기기 확인 필요

---

## 14. ROI가 가장 높은 다음 작업 1개

**layer-color.ts의 `LAYER_COLOR_MAP` key를 canonical `LayerId` type으로 강제 (Record<LayerId, LayerColor>)**

- **근거**: 지금은 `Record<string, LayerColor>`라 오타 방지가 안 됨. `LayerId`로 강제하면 향후 `friendly`류 dead alias 재도입 자체가 컴파일 에러
- **변경**: layer-color.ts 한 파일 (~2줄) + type import
- **예상 시간**: 10분 이내
- **위험도**: 🟢 매우 낮음 (타입 강화만, 런타임 영향 0)

혹은 (선택):

**`people/page.tsx`의 `TierFilter` prefix 컨벤션을 canonical `LayerId`와 통일**

- **근거**: 유일한 prefix(`tier5`, `tier15`...) 컨벤션 잔존. 다른 코드 전부는 `LayerId`(family/core/intimate/trust/maintain) 사용
- **위험도**: 🟡 중간 (sessionStorage 필터값 마이그레이션 필요)
