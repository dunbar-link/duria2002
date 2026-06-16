# Dunbar Link Beta 3 PASS Report

- 작성일: 2026-06-16
- 기준 시작 커밋: a508b5d (`feat: show recent signals on person detail`)
- 최종 커밋: fc92aa1 (`style: group education and employment fields`)
- 환경: https://dunbar-link.vercel.app/dashboard (prod), 실기기 모바일 Chrome + 데스크톱
- 분류 기준: [beta-backlog-triage.md](./beta-backlog-triage.md)

## 테스트 개요

- 실제 사용자: 3명
- 기준 시작 commit: a508b5d
- 최종 commit: fc92aa1
- 판정: **PASS**
- P0: 0건
- 미해결 P1: 0건

## 핵심 기능 검증

- Me 이름 입력
- 사람/친구 생성
- 초대 및 연결
- 신호 전송
- 최근 신호 확인
- Home ↔ +N 이동
- full swap
- hidden/+N 저장
- 모바일 핵심 조작

## 반복 P1 해결

문제:

- Home 4명이 찬 후 다섯 번째 친구 추가가 어려움
- +N 체크표시 의미 불명확
- +N 내부의 친구 추가 진입점 발견 어려움

해결:

- Home 4/4 + hidden 0의 "✓"를 "+"로 변경
- +N 시트에 "+ 친구 추가"를 항상 노출
- 컴팩트 pill 형태로 변경
- Home 빈 슬롯 추가와 +N 직접 추가 경로 분리
- 기존 addPerson / hidden 배치 로직 재사용

관련 commit:

- 5bd77ae (`fix: make hidden friend addition discoverable`)
- 2400d61 (`fix: keep hidden friend add action visible`)

최종 결과:

- Home이 0/4~4/4인 모든 상태에서 +N 친구 추가 가능
- +N에서 추가한 친구는 hidden에 저장
- Home 빈 슬롯에서 추가한 친구는 visible에 저장
- 실기기 PASS

## 가족 카운트 Me 포함

규칙:

- 가족 0명 → 1/∞
- 가족 1명 → 2/∞
- 가족 3명 → 4/∞
- Me는 표시 숫자에만 포함
- Me 카드나 슬롯은 생성하지 않음
- 더보기 N명과 People 전체는 실제 상대방 수 유지

관련 commit:

- 51ae189 (`fix: include self in family counts`)

결과:

- Home과 People 가족 숫자 일치
- 다른 tier와 drag/swap/cap 무영향
- 실기기 PASS

## Me 화면 컴팩트화

반영:

- 카드·섹션 spacing 축소
- 프로필 사진·이름 영역 축소
- 안내 문구 제거 및 단축
- 프로필 카드 내부 배치 개선
- 이름 중복 라벨 제거
- 저장 버튼 컴팩트화 및 중립 색상 적용

관련 commit:

- 37bd607 (`style: compact me page spacing`)
- 9d45bf3 (`style: compact me page header sections`)
- f157476 (`style: tighten me profile card layout`)
- bdd881c (`style: remove redundant me page guidance`)
- fa4413a (`style: simplify me name and save controls`)

결과:

- 기능·저장·사진·키보드 동작 유지
- 모바일 overflow 없음
- 실기기 PASS

## 추가정보 구조 개선

반영:

대학교:

- 학교명
- 학과
- 학번

회사:

- 회사명
- 직위
- 부서

규칙:

- 6개 필드 모두 선택사항
- 각 필드별 비공개 선택
- 체크하지 않으면 공개
- 체크하면 비공개
- 기존 boolean true=공개 구조 유지
- 기존 universityMajor/company fallback 유지
- 서버·DB·API 변경 없음
- localStorage 저장 구조

관련 commit:

- 89d1700 (`feat: split profile details and privacy controls`)
- fc92aa1 (`style: group education and employment fields`)

결과:

- 기존 값 손실 없음
- 기존 비공개 자동 공개 없음
- 공개 로직 단위검증 12/12 PASS
- 대학교·회사 입력 필드 그룹화 완료
- 실기기 PASS

> 참고: 추가정보의 공개/비공개 설정은 현재 localStorage에 저장되는 프로필 상태다. 실제로 다른 사용자에게 추가정보를 보여주거나 숨기는 노출 화면은 아직 없으며, 이번 라운드에서도 공개 프로필 화면을 새로 만들지 않았다. 비공개 체크의 PASS 기준은 입력·저장·복원·상태 보존이다.

## 최종 판정

- 데이터 손실: 없음
- 다른 사람 데이터 노출: 없음
- 앱 진입 실패: 없음
- 핵심 생성·초대·신호 실패: 없음
- 반복 P1: 해결
- **Beta 3: PASS**

## 다음 운영 액션

1. Beta 3 결과를 본 문서로 기록 (완료).
2. 다음 단일 작업: 이메일 로그인·PC/모바일 동기화 **읽기 전용 구조 조사** (분류·조건은 [beta-backlog-triage.md](./beta-backlog-triage.md) Next Phase Candidate 참고).
3. 로그인 구현은 조사 결과와 기존 데이터 이관 위험 확인 후 별도 승인.
