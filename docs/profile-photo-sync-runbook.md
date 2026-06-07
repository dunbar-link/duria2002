# Dunbar Link — Profile Photo Sync Runbook

프로필 사진 cross-device sync(다른 기기에서도 상대 프로필 사진이 보이게 하는 기능)의
운영·복구 문서다. 실기 테스트까지 성공한 최종 상태를 기준으로 정리했다.

> 이 문서는 **운영/복구 참고용**이며 앱 코드 동작을 바꾸지 않는다.
> Supabase env/key, 비밀값은 절대 여기에 적지 않는다.

---

## 1. 최종 성공 상태 요약

실기 테스트에서 확인된 정상 흐름은 다음과 같다.

1. **Me 사진 업로드** — 사용자가 `dashboard/me`에서 프로필 사진을 올린다.
2. **Storage public URL 생성** — `profile-images` bucket에 업로드 후 public URL을 받는다.
   (`app/dashboard/utils/profile-image.ts` → `upload(..., { upsert: true })` → `getPublicUrl()`)
3. **refresh-photo 호출** — `POST /api/invites/refresh-photo`가 내 사진 public URL을
   `dl_invites`의 사진 컬럼에 재동기화한다. (이름 동기화 `refresh-name`과 동일 패턴)
4. **dl_invites photo URL 컬럼 업데이트**
   - `inviter_user_id = me`인 행 → `inviter_photo_url` 갱신
   - `accepted_person_id = me`인 행 → `accepted_person_photo_url` 갱신
   - 빈 값이면 `null`로 클리어(사진 초기화가 상대에게 전파됨)
5. **/api/invites/mine 수신** — 상대 기기가 `GET /api/invites/mine`로 자기 관련 invite를
   받아오고, 응답에 사진 컬럼이 포함된다. (`force-dynamic`, 캐시 안 함)
6. **people store remoteProfilePhotoUrl 반영** — 받은 사진 URL이 people store의
   `remoteProfilePhotoUrl`(원격 진실값)로 저장된다.
7. **Home / People 목록 / People 상세 표시** — 세 화면 모두 상대 실제 사진을 표시한다.
   사진이 없으면 이니셜 fallback.

핵심 원칙: **사진의 진실값은 원격(remote)**이다. 로컬 캐시가 아니라 서버가 내려준
`remoteProfilePhotoUrl`을 우선 표시한다.

---

## 2. 관련 commits

| commit | 내용 |
| --- | --- |
| `166bad8` | fix home live display name and local-only alias |
| `10d1192` | add cross-device profile photo sync (remote truth) |
| `a6f71fd` | chore: add profile photo sync diagnostics |
| `6fc21c0` | chore: expose profile photo upload diagnostics |

`10d1192`가 핵심 기능 커밋이고, `a6f71fd`/`6fc21c0`는 debug-beta 진단(Inspector) 노출,
`166bad8`은 home display name/alias 회귀 보정이다.

---

## 3. 필요한 DB 컬럼

`public.dl_invites`에 아래 두 컬럼이 있어야 한다.

```
public.dl_invites.inviter_photo_url          text
public.dl_invites.accepted_person_photo_url  text
```

- 이 컬럼이 없어도 **이름 동기화는 깨지지 않는다.**
  `/api/invites/mine`는 사진 컬럼 포함으로 먼저 조회하고, 실패하면 기본 컬럼만으로
  폴백한다. `/api/invites/refresh-photo`도 사진 컬럼 update가 실패해도 이름 동기화
  (`refresh-name`)에는 영향이 없다(별도 route).
- 즉 컬럼 누락의 증상은 "이름은 되는데 **사진만** 안 퍼짐"으로 나타난다.

---

## 4. Supabase Storage 필수 설정

프로필 사진은 Supabase Storage에 올라간다. 아래 설정이 모두 맞아야 업로드/표시가 된다.

- **bucket name:** `profile-images` (앱 코드에 하드코딩된 이름 — 변경 금지)
- **public bucket:** public read가 가능해야 한다. public URL로 상대 기기에서 이미지를
  바로 로드하기 때문.
- **anon upload 가능:** 클라이언트(anon 키)에서 직접 업로드하므로 anon이 insert 가능해야 한다.
- **필요한 policy:** Storage `objects`에 대해 `profile-images` bucket 한정으로
  **insert / update / select** policy가 필요하다.
  (`upsert: true`로 올리므로 insert뿐 아니라 update도 필요)

> 보안 주의: bucket 이름과 policy 종류만 적는다.
> **Supabase URL, anon key, service role key 등 어떤 env/key도 이 문서에 쓰지 않는다.**
> 설정은 Supabase 콘솔에서 직접 한다(이 문서는 "무엇이 필요한지"만 기록).

---

## 5. 대표 실패 케이스

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| **Bucket not found** | `profile-images` bucket이 아예 없음 | bucket 생성 + public 설정 (이번 실패의 실제 원인) |
| **RLS / 403 / Unauthorized** | Storage policy 누락(insert/update/select) | bucket 한정 policy 추가 |
| **local Me imageUrl 없음인데 Home엔 사진 보임** | 로컬엔 public URL이 저장 안 됐는데 화면은 remote/캐시로 보이는 상태 | Me 재업로드로 `imageUrl`(public URL) 확보 후 refresh-photo 재호출 |
| **`imageDataUrl`만 있고 `imageUrl` 없음** | data URL(로컬 base64)만 있고 Storage public URL이 없음 → 상대에게 전파 불가 | Storage 업로드가 성공해 public URL(`imageUrl`)이 생기도록 재업로드 |
| **refresh-photo `ok=true` 인데 `hasPhotoUrl=false`** | 빈 photoUrl로 호출돼 컬럼이 `null`로 클리어됨(또는 업로드 실패로 URL이 비어 전달) | 업로드 결과의 public URL이 실제로 채워졌는지 먼저 확인 후 재호출 |

추가 참고:
- `updatedAsInviterCount`/`updatedAsAcceptedCount`가 둘 다 `0`이면, 그 `userId`가
  어떤 invite 행의 `inviter_user_id`/`accepted_person_id`와도 매칭되지 않은 것이다
  (연결 자체 문제 → invite 흐름 점검).

---

## 6. debug-beta Photo Sync Inspector 판독법

위치: `dashboard/debug-beta` → **"섹션 9. Photo Sync Inspector (프로필 사진 동기화 진단)"**
(섹션 8은 Name Sync Inspector)

판독 항목:

**내 쪽(업로드/동기화) 상태**
- `local Me imageUrl` — 로컬에 저장된 내 프로필 public URL 유무/길이. 전체 URL은 노출 안 함.
- `last photo upload result (Storage)`
  - `publicUrlPresent` — Storage 업로드 후 public URL이 실제로 생겼는가 (`true`여야 정상)
  - `errorMessage` — 업로드 실패 메시지 (예: `Bucket not found`)
- `last refresh-photo result`
  - `hasPhotoUrl` — refresh-photo가 사진 URL을 받았는가 (`true`여야 정상, `false`면 클리어/빈값)
  - `updatedAsInviterCount` — inviter로서 갱신된 행 수
  - `updatedAsAcceptedCount` — accepted_person으로서 갱신된 행 수
  - `errorMessage` — update 실패 메시지

**상대(person)별 표시 상태**
- `person.remoteProfilePhotoUrl` — 상대가 올린 실제 사진(원격 진실값)이 store에 반영됐는가
- `invite.inviterPhotoUrl` — 서버 invite 행의 inviter 사진 컬럼 값
- `invite.acceptedPersonPhotoUrl` — 서버 invite 행의 accepted_person 사진 컬럼 값

정상 시그니처(성공 시): `local Me imageUrl 있음` → `publicUrlPresent=true` →
`hasPhotoUrl=true` + `updatedAs*Count ≥ 1` → 상대 행 `person.remoteProfilePhotoUrl 있음`.

---

## 7. 실기 테스트 체크리스트

두 기기(예: 강병구 / 철수)로 양방향 확인한다.

- [ ] **강병구 Me 사진 업로드** → Inspector에서 `publicUrlPresent=true`, `hasPhotoUrl=true`
- [ ] **철수 기기에서 Home / People 목록 / People 상세** 모두 강병구 사진 표시 확인
- [ ] **철수 Me 사진 업로드** → 철수 Inspector에서 동일 시그니처 확인
- [ ] **강병구 기기에서 Home / People 목록 / People 상세** 모두 철수 사진 표시 확인
- [ ] **사진 초기화** 후 양쪽에서 **이니셜 fallback** 표시 확인(컬럼이 `null`로 전파)
- [ ] **이름 변경 / localAlias 회귀** 확인 — 사진 동기화가 이름/별칭 표시를 깨지 않는지

---

## 8. beta 운영 판단

- **Photo Sync Inspector(debug-beta 섹션 9)는 beta 기간 동안 유지**한다.
  실기 진단(업로드/동기화 실패 원인 파악)에 직접 쓰인 도구다.
- 사진 sync가 충분히 안정화되면 **제거 또는 축소** 가능.
- **현재는 유지 권장.** beta 사용자 사이에서 사진 미표시 신고가 들어오면 이 Inspector로
  바로 어느 단계(업로드 / refresh-photo / mine / store)에서 끊겼는지 분리할 수 있다.
