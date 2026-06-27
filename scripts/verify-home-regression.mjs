// 던바링크 Home/Folder 회귀 잠금 정적 검수기 (P2-4k).
//
// P2-4h~P2-4j 에서 반복된 회귀(고치면 다른 게 깨짐)를 막기 위한 "코드 레벨" 잠금.
// Playwright/Jest 같은 무거운 의존성 없이, 핵심 동작을 보장하는 소스 코드 패턴이
// 유지되는지 정적으로 검사한다. (실제 런타임 동작이 아니라 "그 동작을 만드는
// 코드 구조"를 잠근다. 런타임 확인이 필요한 항목은 docs/home-regression-lock.md
// 의 "수동 확인 1회" 목록으로 분리.)
//
// 실행: npm run verify:home-regression
// 종료코드: required 체크가 하나라도 FAIL 이면 1, 아니면 0.
//          knownFail(현재 알려진 미수정)은 결과만 표시하고 종료코드에 영향 없음.
//
// 금지/주의: 이 스크립트는 read-only. DB/네트워크/localStorage 접근 없음.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 주석(//, /* */, JSX {/* */})을 제거해 "active 코드"만 남긴다. 회귀 설명 주석에
// 옛 문구가 남아 있어도 absence 체크가 오탐하지 않게 한다. https:// 같은 URL 은
// // 앞이 ':' 라서 라인주석 정규식에 걸리지 않는다.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s({,;])\/\/[^\n]*/g, "$1");
}

const fileCache = new Map();
function readActive(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);
  let active;
  try {
    active = stripComments(readFileSync(join(ROOT, relPath), "utf8"));
  } catch {
    active = null; // 파일 없음 → 체크에서 FAIL 처리
  }
  fileCache.set(relPath, active);
  return active;
}

// check: { id, group, desc, file, present?: string[], absent?: string[],
//          knownFail?: bool }
const CHECKS = [
  // A. 하단 nav / Android long-press native menu 차단
  {
    id: "A1",
    group: "A nav long-press blocker",
    desc: "하단 nav Link: onContextMenu preventDefault + draggable=false + touch-callout 차단",
    file: "app/dashboard/layout.tsx",
    present: [
      "onContextMenu={(event) => event.preventDefault()}",
      "draggable={false}",
      'WebkitTouchCallout: "none"',
    ],
  },

  // B. +N hidden drag-out
  {
    id: "B1",
    group: "B +N hidden drag-out",
    desc: "+N hidden 타일 long-press drag 설정(deferPointerCaptureUntilLongPress) 유지",
    file: "app/dashboard/_components/home/layer-bottom-sheet.tsx",
    present: ["deferPointerCaptureUntilLongPress", "onLongPressDragStart={onLongPressDragStart}"],
  },
  {
    id: "B2",
    group: "B +N hidden drag-out",
    desc: '"홈에 보이는 사람" preview 블럭이 다시 생기지 않음',
    file: "app/dashboard/_components/home/layer-bottom-sheet.tsx",
    absent: ['title="홈에 보이는 사람"', "ids={visibleSlotIds}"],
  },

  // C. mobile swap / cap (6/5 방지)
  {
    id: "C1",
    group: "C mobile swap/cap",
    desc: "occupied swap cap pre-check(displacedEntityId=swappedTargetEntityId) 유지",
    file: "app/dashboard/page.tsx",
    present: ["displacedEntityId: swappedTargetEntityId"],
  },
  {
    id: "C2",
    group: "C mobile swap/cap",
    desc: "invite-pending occupant swap tier fallback(occupantExists) 유지",
    file: "app/dashboard/page.tsx",
    present: ["occupantExists"],
  },

  // D. folder merge / folder count
  {
    id: "D1",
    group: "D folder merge",
    desc: "기존 폴더에 3명+ 추가 허용(combine 분기에서 !targetIsFolder 제외 제거)",
    file: "app/dashboard/page.tsx",
    present: ["combineEntityIntoTarget"],
    absent: ["!targetIsFolder"],
  },

  // E. folder preview / photo + native image drag 차단
  {
    id: "E1",
    group: "E folder photo",
    desc: "폴더 미니/얼굴 이미지 native drag 차단(draggable=false + pointer-events-none)",
    file: "app/dashboard/_components/home/home-entity-components.tsx",
    present: [
      "getPersonDisplayPhoto",
      "draggable={false}",
      "pointer-events-none absolute inset-0",
    ],
  },
  {
    id: "E2",
    group: "E folder photo",
    desc: "Home 타일 모바일 native drag off(person·folder, freeze 방지)",
    file: "app/dashboard/_components/home/home-entity-components.tsx",
    present: ["const nativeDragEnabled = !dragSourceBlocked && !isCoarsePointer"],
  },

  // F. folder detail sheet
  {
    id: "F1",
    group: "F folder sheet",
    desc: "폴더 세부창 모바일 중앙 정렬(inset-x-0 + calc(100%-36px))",
    file: "app/dashboard/_components/home/folder-bottom-sheet.tsx",
    present: ["inset-x-0", "calc(100% - 36px)"],
    absent: ["inset-x-[18px]"],
  },
  {
    id: "F2",
    group: "F folder sheet",
    desc: '"폴더명" 유지 / 불필요 설명 문구 제거(자동 이름·현재 레이어·이동 안내)',
    file: "app/dashboard/_components/home/folder-bottom-sheet.tsx",
    present: ["폴더명"],
    absent: [
      "자동 이름",
      "현재 레이어",
      "클릭하면 상세로 이동",
      "길게 누르면 레이어 밖으로 이동",
      "길게 눌러 이동",
    ],
  },
  {
    id: "F3",
    group: "F folder sheet",
    desc: "연결 수 PID 기준(로컬 inviteDraft 의존 제거) — 0명 오표시 방지",
    file: "app/dashboard/_components/home/folder-bottom-sheet.tsx",
    absent: ["latestInviteDraft"],
  },

  // G. folder member tile — P2-4j-b 에서 수정 예정(현재 known failing)
  {
    id: "G1",
    group: "G folder member tile",
    desc: "폴더 멤버 모바일 native drag off(freeze 방지) — draggable={!isCoarsePointer}",
    file: "app/dashboard/_components/home/folder-bottom-sheet.tsx",
    present: ["draggable={!isCoarsePointer}"],
    knownFail: true,
  },
  {
    id: "G2",
    group: "G folder member tile",
    desc: "폴더 멤버 연결 실선(BaseEntityVisual isConnected PID 기준 전달)",
    file: "app/dashboard/_components/home/folder-bottom-sheet.tsx",
    present: ["isConnected={isMemberConnected}"],
    knownFail: true,
  },

  // H. sync safety (서버 우선 자동 동기화 헤드리스 구조 보존)
  {
    id: "H1",
    group: "H sync safety",
    desc: "snapshot-sync-panel 헤드리스 서버우선 구조 보존(return null + polling + paused 해제)",
    file: "app/dashboard/_components/sync/snapshot-sync-panel.tsx",
    present: ["VISIBLE_POLL_MS", "writeSyncPaused(false)", "return null"],
  },
];

function runCheck(check) {
  const active = readActive(check.file);
  if (active === null) {
    return { ok: false, reason: `파일 없음: ${check.file}` };
  }
  for (const needle of check.present ?? []) {
    if (!active.includes(needle)) {
      return { ok: false, reason: `없음(있어야 함): ${needle}` };
    }
  }
  for (const needle of check.absent ?? []) {
    if (active.includes(needle)) {
      return { ok: false, reason: `있음(없어야 함): ${needle}` };
    }
  }
  return { ok: true, reason: "" };
}

const results = CHECKS.map((c) => ({ check: c, result: runCheck(c) }));

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log("\n던바링크 Home/Folder 회귀 잠금 검수 (P2-4k)\n");
console.log(pad("ID", 5) + pad("결과", 14) + "항목");
console.log("-".repeat(80));

let requiredFail = 0;
let knownFailCount = 0;
let knownFailFlipped = 0;

for (const { check, result } of results) {
  let label;
  if (check.knownFail) {
    if (result.ok) {
      label = "XPASS(flip)"; // 이제 통과 → required 로 승격 필요
      knownFailFlipped += 1;
    } else {
      label = "XFAIL(P2-4j-b)"; // 예상된 known failing
      knownFailCount += 1;
    }
  } else if (result.ok) {
    label = "PASS";
  } else {
    label = "FAIL";
    requiredFail += 1;
  }
  console.log(pad(check.id, 5) + pad(label, 14) + check.desc);
  if (!result.ok) {
    console.log(pad("", 19) + "↳ " + result.reason + "  [" + check.file + "]");
  }
}

console.log("-".repeat(80));
const total = results.length;
const passed = results.filter(
  (r) => r.result.ok && !r.check.knownFail,
).length;
console.log(
  `required ${passed}/${total - knownFailCount - knownFailFlipped} PASS, ` +
    `required FAIL ${requiredFail}, ` +
    `known-fail(P2-4j-b 예정) ${knownFailCount}` +
    (knownFailFlipped ? `, XPASS(승격필요) ${knownFailFlipped}` : ""),
);

if (knownFailFlipped > 0) {
  console.log(
    "\n[알림] known-fail 항목이 이제 통과합니다. verify-home-regression.mjs 에서 " +
      "해당 체크의 knownFail 플래그를 제거해 required 로 승격하세요.",
  );
}

console.log(
  "\n수동 확인(런타임) 항목은 docs/home-regression-lock.md 참고.\n",
);

process.exit(requiredFail > 0 ? 1 : 0);
