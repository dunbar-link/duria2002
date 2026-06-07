# Dunbar Link 운영자 베타 체크리스트

> 강병구(운영자)가 테스트 결과를 확인할 때 쓰는 실무 체크리스트.

## 1. 테스트 전 확인

- [ ] Vercel 최신 commit 배포가 **Ready** 상태인지 확인
- [ ] 모바일에서 **강력 새로고침** 또는 **PWA 재실행**(서비스워커 캐시 잔존 방지)
- [ ] Supabase Storage **profile-images** bucket 정상(public + upload policy)
- [ ] **/dashboard/debug-beta** 접속 가능(숨김 진단 화면)

## 2. 핵심 성공 기준

- [ ] Me 이름 저장
- [ ] Me 사진 저장
- [ ] refresh-name 반영(상대 기기 이름 갱신)
- [ ] refresh-photo 반영(상대 기기 사진 갱신)
- [ ] invite accept 성공
- [ ] Home 연결자 표시
- [ ] People 연결자 표시
- [ ] Signals 송수신
- [ ] 파란 점 표시 / 읽으면 제거
- [ ] 말풍선 빨간 점 표시 / 읽으면 제거
- [ ] Home 빨간 점은 **미가입/초대중**에만 표시
- [ ] People 연결 완료자 빨간 점 **없음**
- [ ] 폴더 3명 이상 추가(폴더 중앙 drop)
- [ ] 추천 보기 시트 열림
- [ ] Me 저장 버튼 터치 편함

## 3. 테스트 조합

- PC ↔ 모바일
- 모바일 A ↔ 모바일 B
- iPhone Safari
- Android Chrome
- PWA(홈 화면 추가) 실행 상태
- 일반 브라우저 실행 상태

## 4. 문제별 확인 위치

**이름이 안 바뀜**
- Me 탭에서 저장했는지(저장하기 클릭)
- debug-beta 섹션 8(Name Sync Inspector): display / remoteProfileName / invite.inviterName·acceptedPersonName / 판단
- 상대 기기 새로고침(People/Signals 재조회)

**사진이 안 보임**
- debug-beta 섹션 9(Photo Sync Inspector): local Me imageUrl, publicUrlPresent
- last refresh-photo result: hasPhotoUrl / updatedAsInviterCount / updatedAsAcceptedCount
- Storage public URL 생성 여부(errorMessage = "Bucket not found"면 bucket 문제)
- person.remoteProfilePhotoUrl 값

**신호 점이 안 사라짐**
- debug-beta / Signals: unread signal count(상단 💬 빨간 점)
- blue signal sender ids(타일 왼쪽 파란 점은 sender userId 기준)
- Signals 탭에서 읽음/모두 읽음 처리했는지
- 새로고침 후 읽은 신호가 다시 파란 점으로 안 뜨는지

**초대가 안 됨**
- invite token / invite status(pending vs accepted)
- accepted person info(acceptedPersonId / acceptedPersonName)
- 초대 링크가 만료/중복이 아닌지

**폴더가 이상함**
- folder.memberIds(폴더 멤버 데이터)
- drag/drop 시나리오(사람을 폴더 **중앙**에 놓아야 추가, 가장자리는 swap/이동)
- 내부 구성원 5명 이상 시 카드 밖으로 안 나가는지

## 5. 테스트 결과 기록 양식

```
- 테스트 날짜:
- 테스트한 사람:
- 기기:
- 브라우저:
- 성공한 것:
- 이상한 것:
- 캡처:
- 다시 확인할 것:
```

## 6. 지금은 하지 않을 것

(범위 확산 방지)

- 새 기능 추가
- 대규모 디자인 변경
- 추천 엔진 확장
- 더보기 / 폴더 UX 통합
- 공개 출시용 온보딩 개편
- 앱스토어 / 플레이스토어 등록
