export const SIGNAL_RECENT_STORAGE_KEY = "dunbar-link-recent-signals-v1";

export type SignalItem = {
  id: string;
  emoji: string;
};

export type SignalCategoryId =
  | "recent"
  | "react"
  | "heart"
  | "greet"
  | "cheer"
  | "fun"
  | "misc";

export type SignalGridCategoryId = Exclude<SignalCategoryId, "recent">;

export type SignalCategory = {
  id: SignalCategoryId;
  label: string;
};

// 칩 표시 순서 (시트 상단 점프 칩)
export const SIGNAL_CATEGORIES: SignalCategory[] = [
  { id: "recent", label: "자주" },
  { id: "react", label: "반응" },
  { id: "heart", label: "마음" },
  { id: "greet", label: "인사" },
  { id: "cheer", label: "응원" },
  { id: "fun", label: "재미" },
  { id: "misc", label: "기타" },
];

// 그리드 그룹 순서 (recent 제외 — recent는 별도 행에 표시)
export const SIGNAL_GRID_CATEGORY_ORDER: SignalGridCategoryId[] = [
  "react",
  "heart",
  "greet",
  "cheer",
  "fun",
  "misc",
];

const GREET_IDS = new Set(["63", "64", "116", "117", "118"]);
const FUN_IDS = new Set([
  "110",
  "111",
  "112",
  "113",
  "114",
  "115",
  "206",
  "207",
  "208",
]);

export function getSignalCategory(id: string): SignalGridCategoryId {
  if (GREET_IDS.has(id)) return "greet";
  if (FUN_IDS.has(id)) return "fun";

  const n = Number.parseInt(id, 10);
  if (Number.isNaN(n)) return "misc";

  if (n >= 1 && n <= 44) return "react";
  if (n >= 50 && n <= 62) return "heart";
  if (n >= 200 && n <= 205) return "cheer";
  // 음식 70-83, 이동 90-104, 운동 120-134, 그리고 매핑 외 → 기타
  return "misc";
}

export const SIGNALS: SignalItem[] = [
  // 😀 감정
  { id: "1", emoji: "😀" }, { id: "2", emoji: "😁" }, { id: "3", emoji: "😂" }, { id: "4", emoji: "🤣" },
  { id: "5", emoji: "😃" }, { id: "6", emoji: "😄" }, { id: "7", emoji: "😅" }, { id: "8", emoji: "😆" },
  { id: "9", emoji: "😉" }, { id: "10", emoji: "😊" }, { id: "11", emoji: "😋" }, { id: "12", emoji: "😎" },
  { id: "13", emoji: "😍" }, { id: "14", emoji: "😘" }, { id: "15", emoji: "🥰" }, { id: "16", emoji: "😗" },
  { id: "17", emoji: "😙" }, { id: "18", emoji: "😚" }, { id: "19", emoji: "🙂" }, { id: "20", emoji: "🤗" },
  { id: "21", emoji: "🤩" }, { id: "22", emoji: "🥳" }, { id: "23", emoji: "😏" }, { id: "24", emoji: "😒" },
  { id: "25", emoji: "🙄" }, { id: "26", emoji: "😬" }, { id: "27", emoji: "🤥" }, { id: "28", emoji: "😌" },
  { id: "29", emoji: "😔" }, { id: "30", emoji: "😪" }, { id: "31", emoji: "🤤" }, { id: "32", emoji: "😴" },
  { id: "33", emoji: "😷" }, { id: "34", emoji: "🤒" }, { id: "35", emoji: "🤕" }, { id: "36", emoji: "🤢" },
  { id: "37", emoji: "🤮" }, { id: "38", emoji: "🥵" }, { id: "39", emoji: "🥶" }, { id: "40", emoji: "😵" },
  { id: "41", emoji: "🤯" }, { id: "42", emoji: "😤" }, { id: "43", emoji: "😡" }, { id: "44", emoji: "😭" },

  // ❤️ 감정/관계
  { id: "50", emoji: "❤️" }, { id: "51", emoji: "🧡" }, { id: "52", emoji: "💛" },
  { id: "53", emoji: "💚" }, { id: "54", emoji: "💙" }, { id: "55", emoji: "💜" },
  { id: "56", emoji: "🖤" }, { id: "57", emoji: "🤍" }, { id: "58", emoji: "💔" },
  { id: "59", emoji: "💕" }, { id: "60", emoji: "💖" }, { id: "61", emoji: "💘" },
  { id: "62", emoji: "💋" }, { id: "63", emoji: "🫶" }, { id: "64", emoji: "👋" },

  // 🍺 음식/술 (소주 포함)
  { id: "70", emoji: "🍚" }, { id: "71", emoji: "🍜" }, { id: "72", emoji: "🍗" },
  { id: "73", emoji: "🍕" }, { id: "74", emoji: "🍔" }, { id: "75", emoji: "🍣" },
  { id: "76", emoji: "🍰" }, { id: "77", emoji: "🍩" }, { id: "78", emoji: "☕" },
  { id: "79", emoji: "🍺" }, { id: "80", emoji: "🍻" }, { id: "81", emoji: "🍷" },
  { id: "82", emoji: "🥃" }, // 🔥 소주 느낌
  { id: "83", emoji: "🍾" },

  // 🚗 이동 (요청 반영)
  { id: "90", emoji: "🚗" }, // 승용차
  { id: "91", emoji: "🚕" },
  { id: "92", emoji: "🚙" },
  { id: "93", emoji: "🚌" },
  { id: "94", emoji: "🚎" },
  { id: "95", emoji: "🏎️" },
  { id: "96", emoji: "🚓" },
  { id: "97", emoji: "🚑" },
  { id: "98", emoji: "🚒" },
  { id: "99", emoji: "🚆" }, // 기차
  { id: "100", emoji: "🚄" },
  { id: "101", emoji: "🚅" },
  { id: "102", emoji: "✈️" }, // 비행기
  { id: "103", emoji: "🛫" },
  { id: "104", emoji: "🛬" },

  // 🏃 행동 / 활동
  { id: "110", emoji: "🚶" },
  { id: "111", emoji: "🏃" },
  { id: "112", emoji: "💃" },
  { id: "113", emoji: "🕺" },
  { id: "114", emoji: "🧘" },
  { id: "115", emoji: "🛌" },
  { id: "116", emoji: "📞" },
  { id: "117", emoji: "💬" },
  { id: "118", emoji: "📱" },

  // 🏀 운동 (골프 포함)
  { id: "120", emoji: "⚽" },
  { id: "121", emoji: "🏀" },
  { id: "122", emoji: "🏈" },
  { id: "123", emoji: "⚾" },
  { id: "124", emoji: "🎾" },
  { id: "125", emoji: "🏐" },
  { id: "126", emoji: "🏉" },
  { id: "127", emoji: "🎱" },
  { id: "128", emoji: "🏓" },
  { id: "129", emoji: "🏸" },
  { id: "130", emoji: "🥊" },
  { id: "131", emoji: "🥋" },
  { id: "132", emoji: "🎳" },
  { id: "133", emoji: "⛳" }, // 🔥 골프
  { id: "134", emoji: "🏌️" }, // 골프 동작

  // 🎉 기타 (확장용)
  { id: "200", emoji: "🔥" }, { id: "201", emoji: "✨" }, { id: "202", emoji: "⭐" },
  { id: "203", emoji: "🌟" }, { id: "204", emoji: "💥" }, { id: "205", emoji: "💯" },
  { id: "206", emoji: "🎉" }, { id: "207", emoji: "🎁" }, { id: "208", emoji: "🎈" },

  // 🧠 확장 슬롯 (여기 계속 추가 가능)
];