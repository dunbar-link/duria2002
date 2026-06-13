# Dunbar Link Beta Backlog Triage

- 작성일: 2026-06-10
- 기준: 베타 2차 실사용 검증 통과 시점 ([beta-2-pass-report.md](./beta-2-pass-report.md))
- 용도: 베타 운영 중 들어오는 피드백/아이디어를 일관된 기준으로 분류한다.

## 분류 기준

### P0 — 즉시 대응

- 앱 사용 불가
- 초대/수락 불가
- 데이터 손실
- 개인정보/상대 정보 오표시
- 신호가 잘못된 사람에게 감

### P1 — 베타 차단급

- 핵심 루프는 가능하지만 베타 사용을 강하게 막는 문제
- 모바일에서 홈/People/신호 핵심 조작 불가
- 삭제 연결/"알 수 없음" 노출 재발
- 이름/사진 sync 불일치 재발

### P2 — 체감 polish

- 사용은 가능하지만 체감이 떨어지는 polish
- ghost 비주얼
- 엣지 자동 스크롤
- 안내 문구 위치/가시성
- 버튼 문구/간격

### Backlog — 베타 이후 검토

- Signal Library v2
- 이모지 확장
- 답신호 고도화
- 폴더 고급 UX
- 추천/탐색 고도화
- 운영자 도구 추가

### Not Now — 현 단계 논의 보류

- 대규모 graph expansion
- 결제/코인 대개편
- 소셜 피드
- 채팅앱화
- DB schema 대개편
- 추천 알고리즘 대개편

## 현재 Backlog 표

| 항목 | 분류 | 상태 | 이유 | 다음 조건 |
|---|---|---|---|---|
| Signal Library v2 (이모지/카테고리 확장) | Backlog | 대기 | 베타 중 신호 카탈로그 확장 금지 원칙. 현재 신호 전송/답신호 루프는 정상 | 베타 종료 후 별도 Phase로 scope 확정 |
| ghost 비주얼 강화 (anchor 오프셋/그림자/원본 비주얼) | P2 | 대기 | drag 기능·dim·하이라이트는 정상(86e2bcf). 손가락 가림 등 체감 개선 여지만 남음 | 추가 테스터에게서 같은 체감 불만 반복 시 착수 |
| 드래그 중 엣지 자동 스크롤 | P2 | 대기 | 매우 짧은 화면에서 최상단↔최하단 직행 드래그만 불편. 스크롤 후 드래그/+N 이동 메뉴로 우회 가능 | Fold류 사용자에게서 반복 보고 시 착수 |
| 카톡 in-app browser / Edge 이슈 | P2(관찰) | 관찰 중 | 현재 모바일 Chrome 기준 통과. 타 브라우저는 미검증 | 특정 브라우저 재현 보고가 들어오면 진단부터 |
| 베타 운영 문구 개선 | P2 | 대기 | 기능 정상. 안내/온보딩 문구 톤 정리 수준 | 신규 테스터 온보딩에서 혼란 반복 시 |
| 추가 테스트 가이드 업데이트 | Backlog(운영) | 대기 | 3~5명 추가 테스트 전에 docs/beta-test-guide.md 갱신 필요 여부 점검 | 추가 테스터 모집 확정 시 |
| 답신호 고도화 (최근 이모지 추천 등) | Backlog | 대기 | 기본 답신호/또 보내기는 정상(c5c3039). 고도화는 신규 기능 | 답신호 사용 빈도 데이터/피드백 누적 후 |
| 폴더 UX polish | Backlog | 대기 | 폴더 생성/이동/시트 동작 정상. 고급 UX는 베타 범위 외 | 폴더 사용자 반복 피드백 발생 시 |
| 폴더 단체 신호 | P2/Backlog | 대기 | 핵심 루프(1:1 신호)는 정상. 단체 신호는 신규 기능이라 베타 안정화 뒤로 | 베타 핵심 루프 안정 확인 후 scope 확정 |
| 포인트 시스템 | Backlog | 대기 | 베타 단계에서 핵심 루프와 무관한 신규 시스템 | 베타 종료 후 사업성 판단과 함께 검토 |
| 신호함 히스토리 구조 개선 | Backlog | 대기 | 현재 신호함 동작은 정상. 구조 변경은 회귀 위험 대비 효용 낮음 | 히스토리 관련 불편이 반복 보고될 때 |
| Me 페이지 전체 리디자인 | Backlog | 대기 | 기능 정상. 리디자인은 베타 범위 외 | 베타 종료 후 디자인 패스에서 |
| 초대 폼 기본 tier(핵심=5) 하향 검토 | P2 후보 | 관찰 중 | 초대 기본값이 핵심(5)이라 초대만 반복해도 핵심 layer 로 유입되어 cap 에 빨리 닿음. 초대 수락/reconcile 은 사람 증발 방지를 위해 차단하지 않으므로(기존 초과 유지, 신규 진입만 차단) 기본값 하향이 근본 대응 | 핵심 layer 초과 유입이 반복 관찰되면 기본값 50(친밀)로 하향 |
| 초대 공유 메시지에 URL 중복 표시 | P2 | 대기 | 카카오톡 공유 시 본문에 같은 invite URL 이 두 번 보임(+링크 미리보기 카드). 초대 자체는 정상. share payload 의 text 와 url 양쪽에 같은 주소가 들어갔을 가능성 | 본문엔 초대 문구만 두고 url 필드만 쓰거나, 본문 URL 한 번만. Android/카톡/Chrome 공유에서 URL 1회 표시 확인 |

## 베타 피드백 처리 기록

### 2026-06-12 — Beta P1 안정화 패스 (Dunbar tier cap)

베타 피드백 중 "가까운 관계 5명 한도인데 초과 입장됨"을 P1 으로 즉시 수정. Dunbar 제한은 제품 핵심 불변식이라 새 기능보다 우선 처리했다.

**즉시 수정 (P1)**

- Dunbar tier cap 강제: 핵심 5 / 신뢰 15 / 친밀 50 / 친근 150. 표시 숫자(/5 등)와 동일한 count 기준(getLayerRealCount — folder/+N 내부 포함, family-me 제외)으로 모든 진입 경로(데스크톱 drag/drop 4종, 모바일 long-press 2종, 폴더 이동, 빈 슬롯 추가, 검색/추천 추가)에 pre-check 추가. 같은 layer 재배치와 count 중립 swap 은 허용. 차단 시 "○○ 관계는 최대 N명까지 관리할 수 있어요" 토스트 안내.
- 기존에 이미 cap 을 초과한 사용자 데이터는 강제 이동/삭제하지 않는다(신규 진입만 차단). 초대 수락/reconcile 자동 배치도 사람 증발 방지를 위해 차단하지 않는다.
- People 연락(수화기) 버튼 무반응: 설치대기 사람도 picker 가 열려 "복사" 액션이 동작하도록 수정.
- 데이터 초기화 버튼(People 전체 초기화, 홈 시트 로컬 초기화)을 development 전용으로 숨김. `/api/invites/clear-all` 은 인증 없이 모든 사용자의 초대 기록을 지우던 위험 엔드포인트라 production 에서 403 차단.
- People 헤더 홈 단축키 제거(하단 네비 Home 탭과 완전 중복).

**보류 (P2/Backlog 표에 추가)**

- 폴더 단체 신호, 포인트 시스템, 이모지 확장(기존 Signal Library v2), 신호함 히스토리 구조 변경, Me 페이지 리디자인 — 베타 단계에서는 핵심 루프와 Dunbar 제한 불변식 우선.

### 2026-06-13 — Beta P1 데이터 무결성 (동명이인 자동 병합 방지)

서로 다른 초대(token)·기기(PID)의 사용자가 같은 이름을 입력하면 사람 카드가 하나로 자동 병합되고, 병합 과정에서 기존 프로필 사진이 사라지는 P1 데이터 무결성 버그를 수정.

**식별 불변식 (확정)**

- 이름은 표시값일 뿐 식별키가 아니다. `display_name`/`remoteProfileName`/`localAlias`/초대 입력 이름으로 사람을 병합하지 않는다.
- 서로 다른 invite token / PID / connection 은 이름이 같아도 별도 사람으로 유지한다.
- 식별 우선순위: userId(가입 PID) → invite token(provisionalPersonId=`invite-pending-<token>`) → local person id. 로그인/계정 통합은 향후 별도 기능이며, 그때도 이름 일치만으로 자동 병합하지 않는다.

**수정 (P1)**

- `app/dashboard/people/store.ts`: `dedupePeopleByIdentity`·`syncAcceptedInvitesToPeople`(매처 2곳·existingKeys·신규카드 키)·`addPerson` 에서 이름(`normalizePersonName`) 기반 매칭/병합/중복판정을 전부 제거. pending→accepted 연결은 token(provisionalPersonId)/PID 로만 잇는다. 프로필 사진 "비면 비운다" 정책은 이제 PID/token 으로 매칭된 동일 연결에만 적용되므로, 이름만 같은 다른 PID 가 기존 사진을 null 로 덮어쓰지 못한다.
- `app/dashboard/people/page.tsx`: `mergedPeopleSource` 의 `getKey` 에서 `|| p.name` fallback 제거(동명이인이 한 카드로 흡수되지 않게). Home(store 기준)과 People 표시 연결 수가 일치.
- `app/invite/[token]/page.tsx`: Me 이름 입력칸을 전역 `readMeProfileName()` 으로 프리필하지 않는다(이전 초대 이름 누수 차단). 현재 초대 이름 힌트는 해당 token 의 `invitee_name` snapshot 을 흐린 placeholder 로만 표시. 초대 A→힌트 김준석, 초대 B→힌트 준석M 로 token 격리.

**유지(정상 확인, 미변경)**

- 신호 sender/receiver resolve 는 PID 기반(이름 미사용)이라 그대로 둠. 삭제 연결 신호 보호 로직 유지.
- 동일 PID 의 정상 sync(사진 삭제 시 이니셜 복귀, 이름 변경 철수→김철수 반영)는 PID 매칭으로 계속 동작(회귀 확인).

**기존 손상 데이터**

- 이미 병합/중복된 김준석 카드(테스터 1명 기준 3개)는 자동 분리·삭제하지 않는다(어느 신호/사진이 어느 PID 소유인지 자동 추정 시 추가 손상 위험). 신규 재현 방지만 적용하고, 정리는 안전한 개별 삭제 후 재초대 절차로 수동 진행.

### 2026-06-13 — Beta P1 People 카드 증식/집계 불일치 (멱등성)

1439a42 배포 후 실기기에서 People 필터 전환·재진입 시 동일 김준석 카드가 계속 늘어 보이는 회귀(BLOCKED) 수정.

**원인**

- store.people 의 `syncAcceptedInvitesToPeople` 자체는 멱등(동일 응답 N회 sync 해도 길이/ID 집합 불변 — 재현으로 확인). 필터 onClick 도 표시 상태만 바꿈(데이터 생성 없음).
- 진짜 원인은 렌더 결합부 `mergedPeopleSource`. 같은 연결(같은 PID/token)인데 store sync 가 만든 사람의 id(`invite-pending-<token>` 또는 sourcePersonId)와 remote accepted row 의 id(`remote-invite-<token>`)가 달라 dedup 키가 어긋나 **같은 사람이 store/remote 양쪽에서 2장**으로 렌더됐다. PID 미확정 구간/토큰 다수일수록 카드가 부풀어 "필터 전환 때마다 증식"처럼 보였다.
- 13 vs 12: total(13)=가입완료(8)+설치대기(4)+local-only(1). local-only(홈에서 이름만 추가, serverId·pending invite 없음)는 어디에도 안 잡히는 의도된 동작. People-친밀 3 vs Home 2 는 위 렌더 중복이 1 더한 결과 → 수정으로 해소.

**수정 (app/dashboard/people/page.tsx 1파일)**

- `mergedPeopleSource`: canonical store people 를 먼저 채우고 그 사람들의 식별자(PID/person.id)를 모은 뒤, remote accepted invite 는 같은 PID·source person·invite token 이 이미 store 에 있으면 건너뛴다 → 렌더 카드 수 = canonical store 수(필터 전환·재진입에도 불변).
- `buildRemoteInvitePerson` 의 PID 미확정 id fallback 을 `remote-invite-<token>` → `invite-pending-<token>` 로 맞춰 store/remote 토큰 기반 id 일치.
- `RemoteInviteRow` 타입에 `source_person_id` 추가(API 가 반환하는 값, dedup 에 사용).
- store sync(store.ts)는 멱등 확인되어 미변경.

**불변식 적용**: 필터는 읽기 전용 / 동일 PID 1카드 / 동일 token 1카드 / 동명이인(다른 PID)은 별도 유지 / Home·People 은 동일 canonical 기준.

**기존 증식 데이터**: production 브라우저의 김준석 다수 카드는 자동 삭제/병합하지 않음. 신규 재현 차단만 적용. 정리는 카드별 person.id/PID/token/상태 확인 후 개별 삭제(전체 초기화·DB 직접 수정·clear-all 금지).

### 2026-06-13 — Beta P1 People 카드 DOM 누적 (중복 person.id / React key 충돌)

5cd06c6 이후에도 실기기(Android Chrome)에서 가족 필터 반복 시 김준석 카드가 화면에 누적(2→7)되던 BLOCKED 문제. 실기기 원격 DevTools로 원인 확정.

**원인**

- canonical store/localStorage/count 는 불변(증식 아님). 실제 DOM 노드만 누적.
- store.people 13명 중 고유 person.id 12개 — **서로 다른 PID 2명이 동일 local person.id 공유**. 카드 React key 가 `person.id` 단독이라 **중복 key** 발생 → Android Chrome 에서 reconciliation undefined 동작으로 DOM 노드 누적(데스크톱에선 안정적 잘못된 수라 미재현됨).
- 중복 id 생성원: ① `buildAddedPerson` 의 `person-${Date.now()}` (같은 ms 충돌) ② sync 의 새 사람 id 가 `sourcePersonId || provisionalPersonId` 였는데, 같은 source 를 여러 번 초대하면 서로 다른 PID 가 같은 sourcePersonId(=person.id)를 공유.

**수정 (3파일)**

- `app/dashboard/people/data.ts`: `buildAddedPerson` id 를 `crypto.randomUUID()` 기반으로(충돌 불가, 같은 ms 1000개 생성해도 고유). 외부 라이브러리 미추가.
- `app/dashboard/people/store.ts`: sync(missingAccepted/inviterPeople) 새 사람 id 를 공유 가능한 sourcePersonId 대신 수락 1건당 고유한 token 기반 `provisionalPersonId` 로. → 신규 중복 id 차단.
- `app/dashboard/people/page.tsx`: 카드 React key 를 `person.id` 단독 → `getPersonIdentityKey`(PID→id, 이름 제외)로. mergedPeopleSource dedup 과 동일 helper 라 렌더 목록 내 key 가 항상 고유(= Map 키). 구버전 중복 id 데이터도 서로 다른 PID 면 key 가 달라 누적되지 않음.

**검증**: 중복 id 2명 fixture → React 중복키 경고 0, 가족 토글 12회 DOM 2 고정 / id 1000개 전부 고유 / sync 8회 멱등 / 동명이인 2장·사진·hint 격리 회귀 통과.

**기존 데이터/주의**

- 실기기의 기존 중복 id 는 자동 재발급/병합/삭제하지 않음(Home placement·folder·draft·signal 참조를 원자적으로 옮길 근거 부족). React key 수정으로 화면 누적은 해소되나, **동일 person.id 인 기존 2명은 store 연산(removePerson/updatePersonTier 가 id 기준)에서 함께 영향받을 잠재 위험**이 남음 → 카드별 PID/token 확인 후 한 명을 개별 삭제·재초대로 정리 권장(전체 초기화·DB 직접 수정·clear-all 금지).
- count 13 vs 12: 전체 13 = 가입완료 8 + 설치대기 4 + local-only 1(서버 식별자·pending 없는 홈 추가 사람, 의도된 미포함). 고유 id 12 = 기존 중복 id 1쌍(위 데이터). 둘 다 이번 React key 버그와 별개의 기존 데이터 사안.

### 2026-06-13 — Beta P1 People 삭제를 identity/token 스코프로 제한

기존 중복 person.id 카드 정리 가능 여부 조사 중, People 삭제 기능 자체에 데이터 무결성 위험 확인 → 삭제 경로를 identity/token 기준으로 수정(기존 데이터는 정리하지 않음).

**위험(수정 전)**

- People 삭제 `handleDeletePerson` → `removePerson(person.id)` 가 `person.id` 기준 filter → 서로 다른 PID 가 같은 local person.id 를 공유하면 **두 카드 동시 삭제**.
- draft/remote invite 매칭에 **이름 비교** 포함. 서버 `/api/invites/delete-for-person` 가 `invitee_name`/`accepted_person_name` 으로 dl_invites 삭제 → **이름이 같은 다른 사람·다른 PID 의 초대까지 서버에서 삭제**(사용자 스코프 없음).

**수정 (4파일)**

- `store.ts`: `removePersonByIdentity(identityKey)` 추가 — identity(userId/dlUserId/acceptedPersonId → person.id) 기준으로 정확히 한 사람만 제거. 같은 person.id 의 다른 PID 는 보존. draft 정리는 정확 PID(acceptedPersonId/inviterUserId)로만, 이름 비교 0. PID 없으면 draft 미정리(fail-closed). 같은 id 가 남아 있으면 quickNotes 등 공유 참조 유지.
- `people/page.tsx`: `handleDeletePerson` 재작성 — 이름 매칭 전부 제거. 서버 삭제 대상 invite token 은 이 카드의 정확한 remote PID 와 연결된 것만 수집. `removePersonByIdentity(getPersonIdentityKey(...))` 로 로컬 1명만 제거. exact token 이 없으면 서버 호출 생략, 가입(PID) 카드면 "삭제 완료"로 단정하지 않고 재생성 가능 안내(fail-closed UX).
- `api/invites/delete-for-person/route.ts`: **이름 기반 삭제 조건 완전 제거**. `tokens` 없거나 비면 400. token exact match 삭제만. dedup/빈값 제거, 최대 50개, owner(`ownerUserId`) 형식 검증 후 `inviter_user_id`/`accepted_person_id` 스코프(인젝션 방지). personName/personId 무시.
- `docs/beta-backlog-triage.md`: 본 기록.

**불변식**: 이름은 삭제 식별값 금지 / 다른 PID 는 같은 이름·id 라도 별개 / A 삭제 시 B·C 불변 / 서버 삭제는 exact token / token 없으면 fail-closed / 신호 데이터 미삭제.

**검증(격리 fixture, 운영 DB 무삭제)**: A(id=X,PID-A)·B(id=X,PID-B)·C(id=Y,PID-C) → 첫 삭제(C) token-C만·이름 0·A·B 보존 / 둘째 삭제(A) token-A만·**B(같은 person.id) 생존**. route: 이름만→400, 빈 토큰→400, 가짜 토큰→200 deleted 0, dedup/최대50/이름무시 정상. 회귀(React key 경고0, sync 멱등, 동명이인·사진·hint) 통과.

**기존 중복 데이터**: 자동 정리하지 않음. 실제 정리는 카드별 identity key/PID/exact token/유지·제거 대상 확정 후 별도 승인. UI 개별 삭제는 이제 안전(identity/token 스코프)하므로, PASS 후 카드별 삭제로 정리 가능. 단, 홈 "홈에서 제거"(dashboard/page.tsx) 는 아직 person.id 기준(서버 이름삭제는 없음) — 중복 id 정리에는 People 삭제 사용 권장(홈 경로 스코프화는 후속 후보).

### 2026-06-13 — People 상태 3단계(생성/초대/연결) UX 정리

People 상단 `가입 완료 / 설치 대기` 2분류로는 홈에서 이름만 추가한 local-only 사람과 실제 초대 대기를 구분하기 어려워, 상태 표시를 3단계로 통일(상태 UX만, 흐름/스키마/API 무변경).

**상태 정의·우선순위 (이름 미사용)**

- 연결: remote PID(userId/dlUserId/acceptedPersonId) 존재. (기존 가입 완료)
- 초대: PID 없고 현재 초대 대기(기존 검증된 pending 식별 — provisionalPersonId/sourcePersonId 기반 id 색인만, 새 네트워크 요청 없음). (기존 설치 대기)
- 생성: PID 없고 초대 대기도 없는 local-only.
- 판정 순서: 연결 → 초대 → 생성. 이름은 상태 판정에 쓰지 않는다.

**수정 (app/dashboard/people/page.tsx)**

- `resolvePersonStage`/`STAGE_META` 모듈 헬퍼 + `stageByIdentity`(enrichedPeople 를 identity 키로 1회 분류) + `stageCounts`. partition 보장 → 전체 = 생성 + 초대 + 연결.
- 상단 요약: 2칸 대형 → 3칸 compact(생성|초대|연결, 라벨/숫자/패딩 축소, 모바일 한 줄).
- 사람 카드: tier 칩 옆에 tier 보다 낮은 우선순위의 상태 pill(작은 글씨/연한 색). 설명 문장 없음.
- 사용자 화면에서 "가입 완료/설치 대기" 문구 제거. 기존 `allPendingInvitesByPerson`(설치대기 카운트 전용) 제거.

**검증**: fixture(연결7/초대4/생성1) → 상단 생성1·초대4·연결7, 합계 12, 카드 pill 일치, 순서 생성|초대|연결. 회귀(필터 DOM 누적0, 중복 id React key 경고0, 삭제 identity/token 격리) 통과. tsc/build PASS.

## 다음 의사결정 원칙

1. 한 번 나온 불편은 **메모**만 한다 (이 문서 표에 추가).
2. 두 번 이상 반복되면 **P2 후보**로 올린다.
3. 핵심 루프(초대/수락/홈 조작/신호)를 막으면 **P1**.
4. 데이터/상대 정보 오류는 즉시 **P0/P1**.
5. 새 기능은 베타 핵심 안정성보다 항상 뒤에 둔다 (Backlog/Not Now 항목은 승인 전 구현 금지).
6. 브라우저 쿠키/세션 문제로 보이는 재초대 오류는 즉시 앱 코드 수정으로 분류하지 않는다. 먼저 [beta-browser-reset-guide.md](./beta-browser-reset-guide.md) 기준에 따라 시크릿 탭, 외부 브라우저, 다른 브라우저, 사이트 데이터 삭제 순서로 재확인한 뒤, 동일 증상이 반복될 때 P1/P2 여부를 판단한다.
