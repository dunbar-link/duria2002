import type { ContactChannel, DashboardPerson } from "./data";
import { getChannelAvailability, rankChannelsForPerson } from "./data";
import type { RelationshipActionChannel } from "./relationship-status";

export type ContactActionResult = {
  ok: boolean;
  opened: boolean;
  openedChannel: ContactChannel | "copy";
  relationshipChannel: RelationshipActionChannel;
  message: string;
};

export function getChannelLabel(channel: string) {
  if (channel === "call") return "전화";
  if (channel === "message") return "문자";
  if (channel === "kakao") return "카카오";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "telegram") return "Telegram";
  if (channel === "line") return "LINE";
  if (channel === "instagram") return "인스타";
  if (channel === "messenger") return "메신저";
  if (channel === "copy") return "복사";
  return channel;
}

export function normalizeRelationshipChannel(
  channel: string,
): RelationshipActionChannel {
  if (
    channel === "call" ||
    channel === "message" ||
    channel === "kakao" ||
    channel === "whatsapp" ||
    channel === "telegram" ||
    channel === "line" ||
    channel === "instagram" ||
    channel === "messenger" ||
    channel === "copy"
  ) {
    return channel;
  }

  return "copy";
}

function buildSmsHref(phone: string, body: string) {
  const encoded = encodeURIComponent(body);
  return `sms:${phone}?&body=${encoded}`;
}

function buildCallHref(phone: string) {
  return `tel:${phone}`;
}

function buildWhatsAppHref(phone: string, body: string) {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const encoded = encodeURIComponent(body);
  return `https://wa.me/${digits}?text=${encoded}`;
}

function buildTelegramHref(username: string) {
  const clean = username.replace(/^@/, "").trim();
  return `https://t.me/${clean}`;
}

function buildLineHref(lineId: string) {
  return `https://line.me/R/ti/p/~${encodeURIComponent(lineId)}`;
}

function buildInstagramHref(username: string) {
  const clean = username.replace(/^@/, "").trim();
  return `https://www.instagram.com/${clean}/`;
}

function buildMessengerHref(username: string) {
  const clean = username.trim();
  return `https://m.me/${encodeURIComponent(clean)}`;
}

async function copyText(text: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return false;
}

function openHref(href: string) {
  if (typeof window === "undefined") {
    return false;
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  }

  window.location.href = href;
  return true;
}

export function getRecommendedChannels(person: DashboardPerson, limit = 4) {
  return rankChannelsForPerson(person).slice(0, limit);
}

export function getAvailableChannels(person: DashboardPerson) {
  return getChannelAvailability(person).filter((item) => item.available);
}

export function getPrimaryContactChannel(
  person: DashboardPerson,
): ContactChannel | "copy" {
  return getRecommendedChannels(person, 1)[0]?.channel ?? "copy";
}

export async function runPrimaryContactAction(
  person: DashboardPerson,
  draft: string,
): Promise<ContactActionResult> {
  const primaryChannel = getPrimaryContactChannel(person);
  return runPersonContactAction(person, primaryChannel, draft);
}

export async function runPersonContactAction(
  person: DashboardPerson,
  channel: ContactChannel | "copy",
  draft: string,
): Promise<ContactActionResult> {
  const relationshipChannel = normalizeRelationshipChannel(channel);

  try {
    if (channel === "call" && person.phone) {
      openHref(buildCallHref(person.phone));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message:
          "전화 연결을 시도했어요. 이 기기에서 바로 열리지 않으면 휴대폰에서 다시 시도해 주세요.",
      };
    }

    if (channel === "message" && person.phone) {
      openHref(buildSmsHref(person.phone, draft));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message:
          "문자 앱 연결을 시도했어요. 이 기기에서 바로 안 열리면 아래 문구를 복사해서 사용해 주세요.",
      };
    }

    if (channel === "kakao" && person.kakaoTalkUrl) {
      openHref(person.kakaoTalkUrl);
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "카카오 링크를 열었어요.",
      };
    }

    if (channel === "whatsapp" && person.whatsappPhone) {
      openHref(buildWhatsAppHref(person.whatsappPhone, draft));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "WhatsApp으로 열었어요.",
      };
    }

    if (channel === "telegram" && person.telegramUsername) {
      openHref(buildTelegramHref(person.telegramUsername));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "Telegram으로 열었어요.",
      };
    }

    if (channel === "line" && person.lineId) {
      openHref(buildLineHref(person.lineId));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "LINE으로 열었어요.",
      };
    }

    if (channel === "instagram" && person.instagramUsername) {
      openHref(buildInstagramHref(person.instagramUsername));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "Instagram으로 열었어요.",
      };
    }

    if (channel === "messenger" && person.messengerUsername) {
      openHref(buildMessengerHref(person.messengerUsername));
      return {
        ok: true,
        opened: true,
        openedChannel: channel,
        relationshipChannel,
        message: "Messenger로 열었어요.",
      };
    }

    const copied = await copyText(draft);

    if (copied) {
      return {
        ok: true,
        opened: false,
        openedChannel: "copy",
        relationshipChannel: "copy",
        message: "바로 열 수 있는 채널이 없어 문구를 복사했어요.",
      };
    }

    return {
      ok: false,
      opened: false,
      openedChannel: channel,
      relationshipChannel,
      message: "이 채널은 지금 바로 열 수 없어요.",
    };
  } catch {
    const copied = await copyText(draft);

    if (copied) {
      return {
        ok: true,
        opened: false,
        openedChannel: "copy",
        relationshipChannel: "copy",
        message: "앱 실행은 실패했지만 문구를 복사해 두었어요.",
      };
    }

    return {
      ok: false,
      opened: false,
      openedChannel: channel,
      relationshipChannel,
      message: "이 기기에서는 바로 열리지 않았어요.",
    };
  }
}