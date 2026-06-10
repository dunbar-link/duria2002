# Dunbar Link Beta 2차 실사용 검증 통과 보고

- 작성일: 2026-06-10
- 기준 커밋: e3a5e0b (`fix: show me-name guard message inline on signal card`)
- 환경: https://dunbar-link.vercel.app/dashboard (prod), 실기기 모바일 Chrome + 데스크톱

## Summary

- 3명 실사용 테스트 전원 통과.
- 초대 → 수락 → 연결 → 홈 배치 → 신호 → 답신호로 이어지는 핵심 루프 정상.
- 현재 판단: **베타 안정화 라운드 통과**.
- 다음 단계: 새 기능 추가 전, 반복 피드백 수집 단계로 전환.

## 테스트 범위

- 초대 링크 전달 (모바일 공유/클립보드)
- 초대 수락 (모바일 Chrome)
- 이름/사진 반영 (remote profile name / photo sync)
- Home / People sync (tier·이름·사진 일관성)
- 모바일 홈 드래그 (long-press ghost → drop → tier sync)
- Fold / short viewport 홈 스크롤
- 신호 보내기 (홈 타일 / 파란점 답장)
- 신호함 답신호 / 또 보내기
- Me 이름 미완성 guard (신호 차단 + 안내)
- 삭제 연결 후 신호 노출 차단

## 통과 항목

| 항목 | 상태 | 관련 커밋 |
|---|---|---|
| 모바일 drag/drop (ghost·follow·drop·tier sync) | 통과 | 810bbcf, eae3fba, 3f5cf63, 2b48810 |
| source dim / "놓기" 하이라이트 | 통과 | 86e2bcf |
| 모바일 short tap (상세/액션) | 통과 | b752e4e |
| Fold / short viewport 홈 스크롤 | 통과 | 96af8a3 |
| Signal Reply (답신호 / 또 보내기) | 통과 | c5c3039 |
| Me-name guard (신호 차단) | 통과 | 32b6b69 |
| inline guard message (카드 내 안내) | 통과 | e3a5e0b |
| deleted connection signal filter ("알 수 없음" 차단) | 통과 | 9ac4aa0 |
| Home/People tier sync (배치 보정 포함) | 통과 | 9c15bfb |
| name/photo/localAlias 유지 | 통과 | (기존 sync 유지 확인) |

## 이번 안정화 묶음 커밋

- 9ac4aa0 fix: hide signals from deleted connections
- 9c15bfb fix: sync home placement with people tier
- 2b48810 fix: sync mobile home drag with people tier
- 810bbcf fix: disable native mobile drag for person tiles
- 3f5cf63 fix: resolve mobile rail drop targets
- b752e4e fix: restore mobile person tap with deferred pointer capture
- eae3fba fix: prevent scroll takeover on home tile long-press drag
- a3c1cae chore: remove mobile drag diagnostics
- 96af8a3 fix: allow vertical scroll on short-viewport home
- 86e2bcf polish: improve long-press drag feedback
- c5c3039 feat: reply to signals from inbox
- 32b6b69 fix: require me name before inbox signal reply
- e3a5e0b fix: show me-name guard message inline on signal card

## 현재 제품 판단

- 핵심 베타 사용 흐름(초대/수락/연결/홈/신호/답신호)은 통과.
- 지금은 새 기능 추가보다 **반복 피드백 수집** 단계.
- P1은 실제 사용자에게서 **반복**되는 문제만 인정한다.
- P2는 체감 polish / backlog로 분리한다 (분류 기준: [beta-backlog-triage.md](./beta-backlog-triage.md)).

## Known Backlog

- Signal Library v2 (이모지/카테고리 확장)
- ghost 비주얼 강화 (anchor 오프셋/그림자/원본 비주얼)
- 드래그 중 엣지 자동 스크롤
- 답신호 고도화
- 카톡 in-app browser / Edge / Chrome 브라우저별 이슈 관찰
- 베타 운영 문구 개선

## 다음 운영 액션

1. 2차 테스트 결과를 본 문서로 기록 (완료).
2. 3~5명 추가 테스트 진행.
3. 반복 피드백만 P1/P2로 분류 (triage 문서 기준 적용).
4. 기능 추가 전 scope review (backlog 항목은 승인 전 구현 금지).
