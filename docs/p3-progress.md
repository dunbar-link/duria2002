# P3 진행 기록 (제품 정체성 전환)

던바링크를 "신호 앱" → "인맥지도 / 연결 가능성 앱"으로 전환하는 P3 시리즈 요약.
간결 기록용 — 상세 산식/코드는 각 커밋 참조.

## P3-1 — 첫 진입 퀘스트 → Me 성취도
- Home 상단 퀘스트 카드 도입 후, Home 을 가볍게 유지하기 위해 Me 로 이동.
- Me "인맥지도 성취도"로 재배치 → compact + 기본 접힘 아코디언으로 정리.
- 추가정보도 기본 접힘 아코디언("입력 N/7"), 저장 버튼은 추가정보 내부로.
- 결과: Home 은 사람/레이어 중심으로 회복, 진행상황은 Me 에서 확인.

## P3-2 — Point 를 "누적 점수"로 (여러 차례 교정)
- P3-2A: 로컬 누적 Point Ledger(localStorage) 시도 → 기기별 불일치/인플레 발견.
- P3-2A2: localStorage 잔액 장부 폐기 → 서버동기 상태 기반 deterministic 계산 전환.
- P3-2A3: 실화면 불일치(PC 95 / 모바일 395) 근본 수정 — Point/성취도/상단 스탯을
  같은 소스로 통일. 초대/연결은 화면 "초대 성공"과 동일한 서버값
  (/api/me/stats acceptedCount) 기준으로 계산(휘발 token 미사용).
- P3-2B: 신호 보낸 날짜(KST) × 5P 정책/집계 로직 구현. 단 client sender_id 가
  기기별이라 라이브 반영은 보류(플래그 OFF).
- P3-2B-2: 신규 read-only API `GET /api/me/signal-days` 로 서버 auth 기준
  (user_identity_links 의 legacy sender id 전체) 신호 발송일 집계 → live Point 반영.
  계정 기준이라 PC/모바일 동일.

### P3-2 최종 확인값 (대장 계정 예시)
- 친구들 8 · 초대 성공 7 · Point 355 · 성취도 준비도 100% · 6/6 완료
- debug: fields 3 · people 8 · tier 8 · sent 7 · success 7 · conn 7 ·
  signalDays 8 · signalPts 40 · senders 5 · total 355
- PC/모바일 Point 일치 확인.

### P3-2 판정: PASS
- PC/모바일 Point 일치 · localStorage 잔액 방식 폐기 · 서버 auth signalDays ·
  Home 회귀 없음(회귀 14/14 유지). P3-2 완료 확정.

## 남은 보류 (P3-3 이후)
- 서버 Point ledger / anti-abuse: P3-4+.
- 실제 2촌/3촌 개인정보 탐색: 금지(개인정보 필터 보강이 선행 필수).
- 슬롯 cap 재정의(가족4/핵심5/신뢰10/친밀35/친근100): 회귀 스위트 동시수정 별도
  마일스톤.
- signals 1000행 상한: 신호 매우 많은 계정은 오래된 발송일 누락 가능(truncated 반환).

## P3-3 — 인맥 탐색 mock (시도 → 제거, 보류)
- 시도: Me "연결 가능성" 아코디언(mock 추천 3개 + 거리 코드 + 검색 chip). UI-only.
- 실사용 검증(대장 모바일): 목적이 불명확했고, 실제 탐색이 아닌데 탐색처럼 보여
  신뢰를 해칠 수 있다고 판단. Me 탭 목적도 흐려짐.
- 판정: **P3-3 mock UI 제거**(운영 화면에서 내림). network-discovery-card 삭제.
- 실제 그래프/2촌·3촌 탐색·개인정보 노출은 없었음(mock 전용이었음).

### P3 탐색 기능 재개 조건 (다음에 다시 할 때)
1. 거리 코드 설명(의미)이 먼저 필요하다.
2. mock 이 아니라 최소 deterministic derived 추천이어야 한다.
3. 실제 사람 이름/회사/연락처/학교/지역은 승인 전 노출 금지.
4. Me 탭이 아니라 별도 "탐색" 흐름 또는 명확한 CTA 가 필요하다.
5. 개인정보 서버 필터 보강 전 실제 2촌/3촌 탐색 금지.
6. Point 차감/탐색권은 아직 금지.
