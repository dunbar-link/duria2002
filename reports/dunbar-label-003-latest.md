전체 판정: PASS

# DUNBAR-LABEL-003 — layer-color.ts 타입 강화 (dead alias 재도입 방지)

- **작업일**: 2026-07-16
- **작업 식별자**: DUNBAR-LABEL-003-LAYER-COLOR-TYPE-GUARD
- **대상 저장소**: `C:\work\nextjs-server`
- **브랜치**: `main`
- **사전 HEAD**: `69686c6` (DUNBAR-LABEL-002 완료 시점)
- **코드 commit hash**: `000fd52`
- **보고서 commit hash**: (이 파일이 담긴 별 commit)

---

## 1. 사전 상태

| 항목 | 값 |
|---|---|
| branch | `main` |
| local HEAD | `69686c6` |
| origin/main | `69686c6` (일치) |
| working tree | clean |
| untracked | `덴바링크아이콘 이미지/` (기존, 미접근) |

DUNBAR-LABEL-001(`fff232d`+`7db89fd`)/002(`82f621c`+`69686c6`) PASS 상태에서 시작.

---

## 2. 수정 파일

| 파일 | 변경 |
|---|---|
| `app/dashboard/_components/home/layer-color.ts` | +7/-6 (타입 어노테이션 + import + 코멘트만) |

1개 파일만 수정. import 대상 추가 파일 없음(단, `home-page-types.ts`에서 `LayerId` type-only import 1건 추가).

---

## 3. LAYER_COLOR_MAP 타입 강화 내용

**변경 전**:
```ts
export const LAYER_COLOR_MAP: Record<string, LayerColor> = { ... };
```

**변경 후**:
```ts
import type { LayerId } from "./home-page-types";
...
export const LAYER_COLOR_MAP: Record<LayerId, LayerColor> = { ... };
```

- `Record<string, LayerColor>` → `Record<LayerId, LayerColor>`로 타입 좁힘
- `LayerId`는 DUNBAR-LABEL-001에서 `home-page-types.ts`에 이미 export된 canonical union type (`"family" | "core" | "intimate" | "trust" | "maintain"`)
- object literal의 5개 key(`maintain`, `intimate`, `trust`, `core`, `family`)와 색상 값(`bg`/`text`/`border`)은 **1바이트도 변경하지 않음**
- 5개 key가 정확히 `LayerId`의 5개 variant와 일치하므로 즉시 컴파일 통과

**import cycle 확인**: `home-page-types.ts`는 `layer-color.ts`를 참조하지 않음 (grep으로 확인) → 순환 참조 위험 없음, type-only import라 런타임 영향도 0.

---

## 4. friendly 재도입 방지 방식

Record 타입이 `Record<LayerId, LayerColor>`(정확히 5개 key의 완전 매핑)로 강화되어:

1. **`friendly`를 다시 key로 추가하면 즉시 컴파일 에러** — `Record<LayerId, T>`는 `LayerId`에 없는 key를 object literal에 허용하지 않음 (excess property check)
2. **5개 key 중 하나라도 빠지면 컴파일 에러** — `Record<K, T>`는 `K`의 모든 variant가 채워져야 함 (missing property check)
3. 즉 "dead alias 재도입"과 "필수 tier 누락" 양쪽 모두 컴파일 타임에 차단됨

기존 코멘트(DUNBAR-LABEL-001에서 작성한 3줄 히스토리 설명)는 1줄로 압축해 유지: `friendly` 사례를 언급하되 장황한 서술은 제거.

**`friendly` 활성 코드 참조**: 0건 (이 코멘트 1줄 외 전체 코드베이스에 없음, 아래 grep 결과 참조).

---

## 5. 색상/라벨/저장 키 변경 여부

| 항목 | 변경 여부 |
|---|---|
| 색상 값 (`bg`/`text`/`border`) | **변경 없음** — 5개 key 전부 기존 hex 값 그대로 |
| 한글 라벨 | **변경 없음** — 이 파일은 라벨을 다루지 않음(색상 전용) |
| 저장 키 (`family/core/intimate/trust/maintain`) | **변경 없음** |
| `getLayerColor` fallback 로직 | **변경 없음** — if-chain 순서/반환값 동일 |
| DB/API/localStorage | **변경 없음** |
| Home/People/Invite UI | **변경 없음** — 순수 타입 어노테이션 |

---

## 6. 검증 결과

| 검증 | 결과 | 비고 |
|---|---|---|
| `npx tsc --noEmit` | ✅ **PASS** | exit 0, 에러 없음 — 5개 key가 정확히 일치해 즉시 통과 |
| `npm run build` | ✅ **PASS** | 83 static pages 생성 |
| `node scripts/verify-home-regression.mjs` | ✅ **14/14 PASS** | 홈/폴더 회귀 잠금 완전 통과 |
| `npm run lint` | **N/A** | Next 16 `next lint` deprecated (기존과 동일 사유, exit 0) |
| grep `friendly` (reports 제외) | ✅ | `layer-color.ts` 코멘트 1줄만 (활성 코드 0건) |
| grep `LAYER_COLOR_MAP` (reports 제외) | ✅ | `layer-color.ts` 파일 내부 6곳만 (정의 1 + 참조 5, `getLayerColor` 함수를 통해서만 외부 노출 — 캡슐화 유지) |

브라우저 시각 검증: **스킵**. 순수 타입 어노테이션 변경으로 런타임/UI 관찰 가능 동작 변화 0 (컴파일된 JS 출력 동일).

---

## 7. 보고서 경로

- `reports/dunbar-label-003-latest.md` (이 파일)
- `reports/dunbar-label-003-2026-07-16.md` (날짜 스냅샷)

완료 후 latest 보고서를 notepad.exe로 자동 오픈.

---

## 8. commit hash

- **코드**: `000fd52 refactor(labels): type layer color map by canonical ids`
- **보고서**: 이 파일 commit

---

## 9. origin/main == HEAD

- push 전: `origin/main == local main == 69686c6`
- push 후: `origin/main == local main == <new HEAD>` (fast-forward, 일치 확인)

---

## 10. Vercel 수동 deploy 여부

- **수동 deploy: 없음**
- `vercel deploy` / `vercel --prod` / Vercel Dashboard Promote·Deploy 모두 미수행
- main push → Vercel 자동배포 트리거 (허용된 방식)

---

## 11. 남은 위험

- 🟢 결정적 위험 없음. 순수 컴파일 타임 강화이며 런타임 동작 완전 동일
- 관찰:
  - `getLayerColor(layerId: string)`의 파라미터는 여전히 `string` — 호출부(`home-entity-components.tsx`)가 아직 `layerId: string | undefined`를 넘기므로 이 시그니처는 유지가 맞음(과설계 방지). 필요 시 향후 `LayerId`로 좁힐 수 있으나 이번 task 범위 밖
  - `people/page.tsx`의 `getSimpleTierStyle`는 색상을 별도로 정의(layer-color.ts와 무관한 자체 정의) — canonical 통합은 다음 task 후보로 남김(이번 task 범위 외)

---

## 12. ROI가 가장 높은 다음 작업 1개

**`people/page.tsx`의 `getSimpleTierStyle` 색상 정의를 `layer-color.ts`의 `LAYER_COLOR_MAP`으로 통합**

- **근거**: DUNBAR-LABEL-001 조사에서 확인된 별도 색상 정의(`getSimpleTierStyle`, People 카드 chip)가 `layer-color.ts`와 대략 일치하나 여전히 독립 유지 중 — 색상 값이 나중에 갈라질 위험
- **주의**: 이번 task와 달리 이건 **UI 색상 소비처를 바꾸는 변경**이라 "타입만 강화"보다 범위가 큼 — 별도 승인 필요
- **예상 파일**: 1개 (`people/page.tsx`)
- **위험도**: 🟡 중간 (색상 렌더링 실측 비교 필요, 브라우저 검증 필수)
- **대안(더 낮은 위험)**: 이번 것 대신 `getLayerColor`의 파라미터를 `LayerId`로 좁히는 것도 가능하나, 호출부가 `string | undefined`를 넘기는 한 실익이 적어 후순위
