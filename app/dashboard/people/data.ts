"use client";

export type ContactChannel =
  | "call"
  | "message"
  | "whatsapp"
  | "telegram"
  | "line"
  | "kakao"
  | "instagram"
  | "messenger"
  | "copy";

export type ChannelLaunchType = "direct" | "share" | "link" | "copy";

export type DashboardTier = 1 | 5 | 15 | 50 | 150 | 500 | 1500;

export type RelationshipType =
  | "friend"
  | "family"
  | "school"
  | "work"
  | "senior_junior"
  | "business"
  | "other";

export type DashboardPerson = {
  id: string;
  name: string;
  countryCode: string;
  tier: DashboardTier;
  roleLabel: string;
  relationshipType: RelationshipType;
  relationshipDetail: string | null;
  affiliationPrimary: string | null;
  affiliationSecondary: string | null;
  lastContactAt: string | null;
  cadenceDays: number;
  phone: string | null;
  preferredChannels: ContactChannel[];
  notes: string[];
  focusReason: string;

  whatsappPhone: string | null;
  telegramUsername: string | null;
  lineId: string | null;
  kakaoTalkUrl: string | null;
  instagramUsername: string | null;
  messengerUsername: string | null;
};

export type AddDashboardPersonInput = {
  name: string;
  tier: 1 | 5 | 15 | 50 | 150;
  roleLabel?: string;
  relationshipType?: RelationshipType;
  relationshipDetail?: string;
  affiliationPrimary?: string;
  affiliationSecondary?: string;
  countryCode?: string;
  phone?: string;
  kakaoTalkUrl?: string;
  whatsappPhone?: string;
  telegramUsername?: string;
  lineId?: string;
  instagramUsername?: string;
  messengerUsername?: string;
  note?: string;
};

export type ChannelAvailability = {
  channel: ContactChannel;
  available: boolean;
  label: string;
  launchType: ChannelLaunchType;
  reason: string;
};

export type RankedChannel = ChannelAvailability & {
  score: number;
  scoreReason: string;
};

export const channelMeta: Record<
  ContactChannel,
  { label: string; launchType: ChannelLaunchType }
> = {
  call: { label: "Call", launchType: "direct" },
  message: { label: "Message", launchType: "direct" },
  whatsapp: { label: "WhatsApp", launchType: "direct" },
  telegram: { label: "Telegram", launchType: "link" },
  line: { label: "LINE", launchType: "link" },
  kakao: { label: "KakaoTalk", launchType: "share" },
  instagram: { label: "Instagram DM", launchType: "link" },
  messenger: { label: "Messenger", launchType: "link" },
  copy: { label: "Copy", launchType: "copy" },
};

export function getDashboardTierLabel(tier: number) {
  if (tier <= 1) return "가족";
  if (tier <= 5) return "핵심";
  if (tier <= 15) return "신뢰";
  if (tier <= 50) return "친밀";
  if (tier <= 150) return "친근";
  return "기타";
}

function cleanText(value?: string | null) {
  const next = typeof value === "string" ? value.trim() : "";
  return next.length > 0 ? next : null;
}

function cleanCountryCode(value?: string | null) {
  const next = cleanText(value);
  return next ? next.toUpperCase() : "KR";
}

function cleanPhone(value?: string | null) {
  return cleanText(value);
}

function normalizeUsername(value?: string | null) {
  const next = cleanText(value);

  if (!next) {
    return null;
  }

  return next.replace(/^@+/, "");
}

function normalizeRelationshipType(value?: RelationshipType | null) {
  return value ?? "friend";
}

function getDefaultRoleLabel(type: RelationshipType) {
  if (type === "friend") return "친구";
  if (type === "family") return "가족";
  if (type === "school") return "학교";
  if (type === "work") return "직장";
  if (type === "senior_junior") return "선후배";
  if (type === "business") return "거래처";
  return "기타";
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const peopleDirectory: DashboardPerson[] = [
  {
    id: "mina",
    name: "Mina",
    countryCode: "KR",
    tier: 5,
    roleLabel: "핵심 친구",
    relationshipType: "friend",
    relationshipDetail: "오래 알고 지낸 가까운 친구",
    affiliationPrimary: null,
    affiliationSecondary: null,
    lastContactAt: "2026-03-01",
    cadenceDays: 10,
    phone: "01012345678",
    preferredChannels: ["kakao", "message", "call"],
    notes: [
      "최근 이직 준비 중",
      "3월 말 면접 예정",
      "오랜만에 먼저 안부 묻기 좋음",
    ],
    focusReason:
      "핵심 관계인데 최근 접촉 리듬이 살짝 밀렸습니다. 부담 없는 안부가 가장 자연스럽습니다.",
    whatsappPhone: null,
    telegramUsername: null,
    lineId: null,
    kakaoTalkUrl: "https://open.kakao.com/",
    instagramUsername: "mina.sample",
    messengerUsername: "mina.sample",
  },
  {
    id: "jihoon",
    name: "Jihoon",
    countryCode: "KR",
    tier: 15,
    roleLabel: "신뢰 친구",
    relationshipType: "friend",
    relationshipDetail: "가끔 길게 대화하는 가까운 친구",
    affiliationPrimary: null,
    affiliationSecondary: null,
    lastContactAt: "2026-02-10",
    cadenceDays: 21,
    phone: "01098765432",
    preferredChannels: ["message", "call", "telegram"],
    notes: [
      "가족 일정 때문에 바빴음",
      "짧은 문자나 전화가 잘 맞는 타입",
      "답장 부담 적은 문구가 좋음",
    ],
    focusReason:
      "장기 미접촉으로 넘어가기 직전입니다. 짧은 체크인 메시지로 관계 리듬을 회복하기 좋습니다.",
    whatsappPhone: null,
    telegramUsername: "jihoon_sample",
    lineId: null,
    kakaoTalkUrl: null,
    instagramUsername: null,
    messengerUsername: null,
  },
  {
    id: "sora",
    name: "Sora",
    countryCode: "JP",
    tier: 50,
    roleLabel: "친밀 관계",
    relationshipType: "other",
    relationshipDetail: "행사에서 자주 마주치는 연결",
    affiliationPrimary: null,
    affiliationSecondary: null,
    lastContactAt: "2025-12-24",
    cadenceDays: 45,
    phone: null,
    preferredChannels: ["line", "instagram", "copy"],
    notes: [
      "행사 때 자주 마주침",
      "가벼운 안부 + 근황 질문이 잘 맞음",
      "직접 전화보다 메신저 선호",
    ],
    focusReason:
      "관계가 끊기기 전에 약한 연결을 다시 살릴 시점입니다. 메신저형 접근이 가장 부드럽습니다.",
    whatsappPhone: null,
    telegramUsername: null,
    lineId: "sora_line_sample",
    kakaoTalkUrl: null,
    instagramUsername: "sora.sample",
    messengerUsername: null,
  },
  {
    id: "david",
    name: "David",
    countryCode: "US",
    tier: 50,
    roleLabel: "친밀 친구",
    relationshipType: "friend",
    relationshipDetail: "해외에 사는 친구",
    affiliationPrimary: null,
    affiliationSecondary: null,
    lastContactAt: "2026-01-20",
    cadenceDays: 30,
    phone: "+14155550123",
    preferredChannels: ["whatsapp", "instagram", "messenger"],
    notes: [
      "해외 거주",
      "전화보다 비동기 메신저 선호",
      "WhatsApp 반응이 가장 빠름",
    ],
    focusReason:
      "시차가 있어서 실시간 통화보다 비동기 메신저가 적합합니다. 짧고 가벼운 메시지가 좋습니다.",
    whatsappPhone: "+14155550123",
    telegramUsername: null,
    lineId: null,
    kakaoTalkUrl: null,
    instagramUsername: "david.sample",
    messengerUsername: "david.sample",
  },
];

export const legacyPersonIdMap: Record<string, string> = {
  p_mina: "mina",
  p_jiho: "jihoon",
  p_jihoon: "jihoon",
  jiho: "jihoon",
  p_sora: "sora",
  p_david: "david",
};

export function normalizeDashboardPersonId(personId: string) {
  const raw = typeof personId === "string" ? personId.trim() : "";

  if (!raw) {
    return "";
  }

  const decoded = safeDecodeURIComponent(raw);
  return legacyPersonIdMap[decoded] ?? decoded;
}

export function getPersonById(personId: string, people?: DashboardPerson[]) {
  const normalizedId = normalizeDashboardPersonId(personId);
  const source = people ?? peopleDirectory;

  return source.find((person) => person.id === normalizedId) ?? null;
}

export function findDashboardPersonById(
  personId: string,
  people?: DashboardPerson[],
) {
  return getPersonById(personId, people);
}

export function getCadenceDaysByTier(tier: DashboardTier): number {
  if (tier <= 1) return 3;
  if (tier <= 5) return 7;
  if (tier <= 15) return 14;
  if (tier <= 50) return 30;
  if (tier <= 150) return 60;
  if (tier <= 500) return 120;
  return 365;
}

function getPreferredChannelsFromInput(input: AddDashboardPersonInput): ContactChannel[] {
  const channels: ContactChannel[] = [];

  if (cleanText(input.kakaoTalkUrl)) {
    channels.push("kakao");
  }

  if (cleanText(input.phone)) {
    channels.push("message", "call");
  }

  if (cleanText(input.whatsappPhone)) {
    channels.push("whatsapp");
  }

  if (cleanText(input.telegramUsername)) {
    channels.push("telegram");
  }

  if (cleanText(input.lineId)) {
    channels.push("line");
  }

  if (cleanText(input.instagramUsername)) {
    channels.push("instagram");
  }

  if (cleanText(input.messengerUsername)) {
    channels.push("messenger");
  }

  channels.push("copy");

  return [...new Set(channels)];
}

export function buildAddedPerson(input: AddDashboardPersonInput): DashboardPerson {
  const trimmedName = input.name.trim();
  const relationshipType = normalizeRelationshipType(input.relationshipType);
  const trimmedRoleLabel =
    cleanText(input.roleLabel) ?? getDefaultRoleLabel(relationshipType);
  const trimmedCountryCode = cleanCountryCode(input.countryCode);
  const trimmedNote = cleanText(input.note);

  return {
    id: `person-${Date.now()}`,
    name: trimmedName,
    countryCode: trimmedCountryCode,
    tier: input.tier,
    roleLabel: trimmedRoleLabel,
    relationshipType,
    relationshipDetail: cleanText(input.relationshipDetail),
    affiliationPrimary: cleanText(input.affiliationPrimary),
    affiliationSecondary: cleanText(input.affiliationSecondary),
    lastContactAt: null,
    cadenceDays: getCadenceDaysByTier(input.tier),
    phone: cleanPhone(input.phone),
    preferredChannels: getPreferredChannelsFromInput(input),
    notes: trimmedNote ? [trimmedNote] : [],
    focusReason: "새로 추가된 사람입니다. 먼저 가볍게 안부를 시작해보세요.",
    whatsappPhone: cleanPhone(input.whatsappPhone),
    telegramUsername: normalizeUsername(input.telegramUsername),
    lineId: cleanText(input.lineId),
    kakaoTalkUrl: cleanText(input.kakaoTalkUrl),
    instagramUsername: normalizeUsername(input.instagramUsername),
    messengerUsername: normalizeUsername(input.messengerUsername),
  };
}

export function formatRelativeContactText(person: DashboardPerson) {
  if (!person.lastContactAt) {
    return "아직 접촉 기록이 없습니다";
  }

  const today = new Date();
  const last = new Date(person.lastContactAt);

  if (Number.isNaN(last.getTime())) {
    return "최근 접촉 기록을 확인할 수 없습니다";
  }

  const diffMs = today.getTime() - last.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return "오늘 마지막 접촉";
  if (diffDays === 1) return "1일 전 마지막 접촉";
  return `${diffDays}일 전 마지막 접촉`;
}

export function getCadenceStatus(person: DashboardPerson) {
  if (!person.lastContactAt) {
    return {
      tone: "review" as const,
      label: "리듬 없음",
      description: "첫 연락 또는 복원 대상입니다.",
    };
  }

  const today = new Date();
  const last = new Date(person.lastContactAt);

  if (Number.isNaN(last.getTime())) {
    return {
      tone: "review" as const,
      label: "리듬 없음",
      description: "첫 연락 또는 복원 대상입니다.",
    };
  }

  const diffMs = today.getTime() - last.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const ratio = diffDays / person.cadenceDays;

  if (ratio < 0.7) {
    return {
      tone: "healthy" as const,
      label: "건강한 리듬",
      description: "아직 여유가 있지만 가볍게 챙길 수 있습니다.",
    };
  }

  if (ratio <= 1.15) {
    return {
      tone: "due" as const,
      label: "지금 챙길 시점",
      description: "현재 리듬에 가장 잘 맞는 타이밍입니다.",
    };
  }

  return {
    tone: "restore" as const,
    label: "복원 필요",
    description: "리듬이 밀렸습니다. 지금 다시 연결하는 편이 좋습니다.",
  };
}

export function buildSuggestedMessage(person: DashboardPerson) {
  const firstNote = person.notes[0] ?? "잘 지내는지 궁금했어요";

  return [
    `${person.name}님, 오랜만이에요.`,
    `문득 생각나서 안부 남겨요.`,
    `${firstNote}`,
  ].join(" ");
}

export function buildMessageReason(person: DashboardPerson) {
  const cadence = getCadenceStatus(person);

  return `${cadence.label}. ${person.focusReason}`;
}

function hasPhone(person: DashboardPerson) {
  return Boolean(person.phone && person.phone.trim().length > 0);
}

function hasWhatsapp(person: DashboardPerson) {
  return Boolean(person.whatsappPhone && person.whatsappPhone.trim().length > 0);
}

function hasTelegram(person: DashboardPerson) {
  return Boolean(person.telegramUsername && person.telegramUsername.trim().length > 0);
}

function hasLine(person: DashboardPerson) {
  return Boolean(person.lineId && person.lineId.trim().length > 0);
}

function hasKakao(person: DashboardPerson) {
  return Boolean(person.kakaoTalkUrl && person.kakaoTalkUrl.trim().length > 0);
}

function hasInstagram(person: DashboardPerson) {
  return Boolean(person.instagramUsername && person.instagramUsername.trim().length > 0);
}

function hasMessenger(person: DashboardPerson) {
  return Boolean(person.messengerUsername && person.messengerUsername.trim().length > 0);
}

export function getChannelAvailability(person: DashboardPerson): ChannelAvailability[] {
  return [
    {
      channel: "call",
      available: hasPhone(person),
      label: channelMeta.call.label,
      launchType: channelMeta.call.launchType,
      reason: hasPhone(person)
        ? "전화번호가 있어서 바로 통화 앱 연결이 가능합니다."
        : "전화번호가 없습니다.",
    },
    {
      channel: "message",
      available: hasPhone(person),
      label: channelMeta.message.label,
      launchType: channelMeta.message.launchType,
      reason: hasPhone(person)
        ? "전화번호가 있어서 문자 앱 연결이 가능합니다."
        : "전화번호가 없습니다.",
    },
    {
      channel: "whatsapp",
      available: hasWhatsapp(person),
      label: channelMeta.whatsapp.label,
      launchType: channelMeta.whatsapp.launchType,
      reason: hasWhatsapp(person)
        ? "WhatsApp용 번호가 등록되어 있습니다."
        : "WhatsApp용 번호가 없습니다.",
    },
    {
      channel: "telegram",
      available: hasTelegram(person),
      label: channelMeta.telegram.label,
      launchType: channelMeta.telegram.launchType,
      reason: hasTelegram(person)
        ? "Telegram username이 있습니다."
        : "Telegram username이 없습니다.",
    },
    {
      channel: "line",
      available: hasLine(person),
      label: channelMeta.line.label,
      launchType: channelMeta.line.launchType,
      reason: hasLine(person)
        ? "LINE ID가 등록되어 있습니다."
        : "LINE ID가 없습니다.",
    },
    {
      channel: "kakao",
      available: hasKakao(person),
      label: channelMeta.kakao.label,
      launchType: channelMeta.kakao.launchType,
      reason: hasKakao(person)
        ? "카카오 링크가 등록되어 있습니다."
        : "직접 열 수 있는 카카오 링크가 없습니다.",
    },
    {
      channel: "instagram",
      available: hasInstagram(person),
      label: channelMeta.instagram.label,
      launchType: channelMeta.instagram.launchType,
      reason: hasInstagram(person)
        ? "Instagram username이 있습니다."
        : "Instagram username이 없습니다.",
    },
    {
      channel: "messenger",
      available: hasMessenger(person),
      label: channelMeta.messenger.label,
      launchType: channelMeta.messenger.launchType,
      reason: hasMessenger(person)
        ? "Messenger username이 있습니다."
        : "Messenger username이 없습니다.",
    },
    {
      channel: "copy",
      available: true,
      label: channelMeta.copy.label,
      launchType: channelMeta.copy.launchType,
      reason: "항상 사용할 수 있는 fallback입니다.",
    },
  ];
}

function getCountryBoost(person: DashboardPerson, channel: ContactChannel) {
  const country = person.countryCode.toUpperCase();

  if (country === "KR") {
    if (channel === "kakao") return 18;
    if (channel === "message") return 10;
    if (channel === "call") return 6;
  }

  if (country === "JP") {
    if (channel === "line") return 18;
    if (channel === "message") return 6;
  }

  if (country === "US") {
    if (channel === "message") return 12;
    if (channel === "whatsapp") return 8;
    if (channel === "messenger") return 6;
  }

  return 0;
}

function getTierBoost(tier: DashboardTier, channel: ContactChannel) {
  if (tier === 1 || tier === 5) {
    if (channel === "call") return 10;
    if (channel === "message") return 8;
    if (channel === "kakao") return 8;
  }

  if (tier === 15) {
    if (channel === "message") return 10;
    if (channel === "telegram") return 7;
    if (channel === "call") return 5;
  }

  if (tier >= 50) {
    if (channel === "instagram") return 6;
    if (channel === "messenger") return 6;
    if (channel === "line") return 6;
    if (channel === "whatsapp") return 6;
  }

  return 0;
}

function getPreferenceBoost(person: DashboardPerson, channel: ContactChannel) {
  const index = person.preferredChannels.indexOf(channel);

  if (index === 0) return 28;
  if (index === 1) return 18;
  if (index === 2) return 10;
  if (index >= 3) return 6;

  return 0;
}

function getCadenceBoost(person: DashboardPerson, channel: ContactChannel) {
  const cadence = getCadenceStatus(person);

  if (cadence.tone === "healthy") {
    if (
      channel === "message" ||
      channel === "kakao" ||
      channel === "instagram" ||
      channel === "telegram" ||
      channel === "line" ||
      channel === "whatsapp"
    ) {
      return 8;
    }

    if (channel === "call") {
      return 2;
    }
  }

  if (cadence.tone === "due") {
    if (channel === "message" || channel === "kakao" || channel === "whatsapp") {
      return 12;
    }

    if (channel === "call") {
      return 6;
    }
  }

  if (cadence.tone === "restore") {
    if (channel === "call") return 12;
    if (channel === "message") return 10;

    if (channel === "kakao" || channel === "whatsapp" || channel === "telegram") {
      return 8;
    }
  }

  return 0;
}

export function rankChannelsForPerson(person: DashboardPerson): RankedChannel[] {
  const availability = getChannelAvailability(person);

  return availability
    .filter((item) => item.available)
    .map((item) => {
      const preferenceBoost = getPreferenceBoost(person, item.channel);
      const countryBoost = getCountryBoost(person, item.channel);
      const tierBoost = getTierBoost(person.tier, item.channel);
      const cadenceBoost = getCadenceBoost(person, item.channel);

      const score = 20 + preferenceBoost + countryBoost + tierBoost + cadenceBoost;

      const reasonParts = [
        preferenceBoost > 0 ? "사용자 선호 반영" : null,
        countryBoost > 0 ? "국가별 채널 적합성 반영" : null,
        tierBoost > 0 ? "관계 깊이 반영" : null,
        cadenceBoost > 0 ? "지금 연락 타이밍 반영" : null,
        item.channel === "copy" ? "항상 가능한 fallback" : null,
      ].filter(Boolean);

      return {
        ...item,
        score,
        scoreReason: reasonParts.join(" · ") || "기본 fallback 또는 일반 채널 점수",
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getPrimaryChannel(person: DashboardPerson) {
  return rankChannelsForPerson(person)[0] ?? null;
}