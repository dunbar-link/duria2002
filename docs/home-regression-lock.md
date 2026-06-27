# 던바링크 Home/Folder 회귀 잠금 (P2-4k)

P2-4h~P2-4j 에서 Home/+N/폴더/drag·drop/동기화 UX를 반복 수정하며 "하나 고치면
다른 게 깨지는" 회귀가 잦았다. 추가 수정 전에 **PASS된 동작을 코드 레벨로 잠근다.**

## 자동 검수 (정적)

```
npm run verify:home-regression
```

- Playwright/Jest 같은 무거운 의존성 없이, 핵심 동작을 만드는 **소스 코드 패턴**이
  유지되는지 검사한다(주석 제거 후 검사 → 설명 주석의 옛 문구는 오탐 안 함).
- required 체크가 하나라도 FAIL 이면 종료코드 1.
- `XFAIL(P2-4j-b)` = 현재 알려진 미수정(아래 G 그룹). 종료코드에 영향 없음.
- known-fail 이 통과로 바뀌면(`XPASS(flip)`) 스크립트에서 `knownFail` 플래그를
  제거해 required 로 승격한다.

Home/Folder 관련 파일을 수정한 뒤에는 항상 아래를 함께 돌린다:

```
npm run verify:home-regression
npx tsc --noEmit
npm run build
```

## 자동 잠금 항목 (코드 패턴)

| ID | 그룹 | 내용 |
|----|------|------|
| A1 | nav long-press blocker | 하단 nav Link: onContextMenu preventDefault + draggable=false + touch-callout 차단 |
| B1 | +N hidden drag-out | +N hidden 타일 long-press drag(deferPointerCaptureUntilLongPress) 유지 |
| B2 | +N hidden drag-out | "홈에 보이는 사람" preview 블럭 재생성 금지 |
| C1 | mobile swap/cap | occupied swap cap pre-check(displaced=swappedTargetEntityId) |
| C2 | mobile swap/cap | invite-pending occupant swap tier fallback |
| D1 | folder merge | 기존 폴더 3명+ 추가(combine 분기 !targetIsFolder 제외 제거) |
| E1 | folder photo | 폴더 미니/얼굴 이미지 native drag 차단(draggable=false + pointer-events-none) |
| E2 | folder photo | Home 타일 모바일 native drag off(person·folder freeze 방지) |
| F1 | folder sheet | 폴더 세부창 모바일 중앙정렬(inset-x-0 + calc(100%-36px)) |
| F2 | folder sheet | "폴더명" 유지 / 자동 이름·현재 레이어·이동 안내 문구 제거 |
| F3 | folder sheet | 연결 수 PID 기준(로컬 inviteDraft 의존 제거) |
| G1 | folder member tile | 폴더 멤버 모바일 native drag off(freeze 방지) — draggable={!isCoarsePointer} |
| G2 | folder member tile | 폴더 멤버 연결 실선(isConnected PID 기준 전달) |
| H1 | sync safety | snapshot-sync-panel 헤드리스 서버우선 구조 보존(return null + polling + paused 해제) |

## 수동 확인 1회 필요 (런타임 — 정적으로 못 잡음)

실기기/브라우저에서 1회 확인. Home/Folder 큰 수정 후 권장.

1. +N(더보기) 사람 long-press → ghost 생성 + 손가락 추적 → Home tier/slot drop 이동
2. 핵심 5/5에서 다른 tier 친구를 핵심 기존 아이콘 위 drop → swap, 6/5 안 됨
3. 핵심 5/5 빈자리 이동 시도 → "더는 이동 못함" 안내(차단)
4. 강한 겹침(중앙) drop → 폴더 merge / 약한 겹침 → swap
5. 기존 2명 폴더에 3·4명+ 추가, 같은 사람 중복 추가 안 됨
6. 폴더 미니 아이콘/시트 멤버 사진 표시(없으면 이니셜)
7. 폴더 long-press freeze 없음(Home 폴더 타일)
8. 폴더 세부창 멤버 long-press freeze 없음 (G1 — required lock)
9. 폴더 세부창 중앙정렬 + "연결됨 N명 · 전체 N명" 정확
10. 로그인/새로고침 시 서버 최신 자동 반영(카드 없이), 모바일↔PC 자동 동기화
11. 하단 nav 길게 눌러도 브라우저 링크 메뉴 안 뜸

## 승격 이력

- P2-4j-b(폴더 멤버 freeze + 연결 테두리) 적용 완료 → G1/G2 를 required 로 승격
  (knownFail 제거). 현재 required 14/14 PASS 가 잠금 기준이다.

향후 known-fail 항목을 추가할 때는 해당 체크에 `knownFail: true` 를 달고,
수정 완료 후 `XPASS(flip)` 가 뜨면 플래그를 제거해 required 로 승격한다.
