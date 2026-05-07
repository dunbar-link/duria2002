# CURRENT_STATUS.md — Dunbar Link 현재 개발 상태

이 파일은 Claude Code가 현재 개발 상태를 기억하기 위한 기준 문서입니다.
작업 완료 후 이 파일을 업데이트하여 상태를 유지합니다.

---

## 프로젝트 현재 상태

- **프로젝트명:** Dunbar Link
- **성격:** 신호 기반 관계 유지 앱
- **UX 방향:** 모바일 퍼스트
- **단계:** 베타 테스트 준비 단계

---

## 현재 안정 기능

- 홈 레이어 구조
- 폴더 생성 / 이동
- 신호 보내기
- 신호 읽음 처리
- 초대 링크 생성
- `invite/[token]` 연결
- Supabase signals 저장
- push subscribe / send
- bottom nav 고정
- 홈 헤더 고정 방향

---

## 최근 안정화 완료 항목

| 항목 | 내용 |
|------|------|
| push API deprecated redirect | `app/api/api/push/` 구버전 2개 파일 → 308 redirect 처리 |
| 검은 알림 UI 제거 | `dashboard-home-header.tsx` 구버전 검은 "알림 ON" 버튼 제거 |
| push 경로 정리 | 프론트엔드는 `/api/push/` 정상 경로만 사용 확인 |
| TypeScript 검증 | `npx tsc --noEmit` Exit code 0 성공 상태 |

---

## 현재 구조 특징

- **라우팅:** Next.js App Router 기반
- **중심 구조:** `app/dashboard/` 중심
- **상태 관리:** Zustand
- **데이터베이스:** Supabase
- **영속성:** localStorage persistence 사용

---

## 현재 주의사항

- `lib/auth/middleware.ts` — auth 미들웨어 아직 완전 복구하지 않음 (스텁 상태)
- Supabase 클라이언트 중복 구조 존재 (`lib/supabase.ts` 구버전 vs `lib/supabase/` 신버전)
- 일부 구버전 파일 deprecated 상태로 유지 중 (삭제하지 않음)
- 대규모 리팩토링 금지 — 구조 변경은 명시적 승인 후에만

---

## 현재 MVP 목표

- 실제 친구 3~5명 베타 테스트 가능 상태 만들기
- 초대 → 설치 → 연결 → 신호 흐름 안정화
- 관계 유지 행동 유도 강화

---

## 제품 철학

- 채팅앱 아님 — 관계 유지 앱
- 행동 중심 (설명보다 즉시 액션)
- 최소 텍스트 / 아이콘 중심
- 사람 중심 그래프
- 기관/학교/회사 노드 사용자 그래프 노출 금지
