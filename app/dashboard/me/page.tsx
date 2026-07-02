"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { isIncompleteMeName, readMeProfileImageUrl } from "@/lib/me/profile-name";
import { usePeopleStore } from "../people/store";
import { AccountSection } from "./account-section";
import QuestAchievementCard, { buildQuestMissions } from "../_components/me/quest-achievement-card";
import {
  buildDeterministicPointScore,
  readPointEffectSeen,
  writePointEffectSeen,
} from "../_components/me/point-ledger";

const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v3";
const LEGACY_PROFILE_STORAGE_KEY_V2 = "dunbar-link-me-profile-v2";
const LEGACY_PROFILE_STORAGE_KEY_V1 = "dunbar-link-me-profile-v1";
const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";
// refresh-photo 호출 결과를 debug-beta Photo Sync Inspector 가 읽도록 남기는 키.
const LAST_REFRESH_PHOTO_RESULT_KEY = "dunbar-link-last-refresh-photo-result";
// Storage 사진 업로드 결과를 debug-beta 가 읽도록 남기는 키.
const LAST_PHOTO_UPLOAD_RESULT_KEY = "dunbar-link-last-photo-upload-result";

const PROFILE_BG = "#EFE7FA";
const PROFILE_TEXT = "#4B2E83";
const PROFILE_BORDER = "#CDB7EE";
const PROFILE_IMAGE_BUCKET = "profile-images";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type MeProfile = {
  name: string;
  phone: string;
  phonePublic: boolean;
  email: string;
  emailPublic: boolean;
  address: string;
  addressPublic: boolean;
  birthday: string;
  birthdayPublic: boolean;
  elementarySchool: string;
  elementarySchoolPublic: boolean;
  middleSchool: string;
  middleSchoolPublic: boolean;
  highSchool: string;
  highSchoolPublic: boolean;
  // universityMajor / company 는 레거시 단일 필드(즉시 삭제하지 않고 복원 fallback 용으로 유지).
  universityMajor: string;
  universityMajorPublic: boolean;
  company: string;
  companyPublic: boolean;
  schoolName: string;
  schoolNamePublic: boolean;
  major: string;
  majorPublic: boolean;
  studentId: string;
  studentIdPublic: boolean;
  companyName: string;
  companyNamePublic: boolean;
  jobTitle: string;
  jobTitlePublic: boolean;
  department: string;
  departmentPublic: boolean;
  imageUrl: string;
  imageDataUrl: string;
};

// 신규 프로필은 모든 추가정보가 기본 공개(true). 기존 프로필은 buildProfileFromUnknown 이
// 저장된 값을 그대로 복원하므로 이 기본값의 영향을 받지 않는다(자동 공개 없음).
const defaultProfile: MeProfile = {
  name: "",
  phone: "",
  phonePublic: true,
  email: "",
  emailPublic: true,
  address: "",
  addressPublic: true,
  birthday: "",
  birthdayPublic: true,
  elementarySchool: "",
  elementarySchoolPublic: true,
  middleSchool: "",
  middleSchoolPublic: true,
  highSchool: "",
  highSchoolPublic: true,
  universityMajor: "",
  universityMajorPublic: true,
  company: "",
  companyPublic: true,
  schoolName: "",
  schoolNamePublic: true,
  major: "",
  majorPublic: true,
  studentId: "",
  studentIdPublic: true,
  companyName: "",
  companyNamePublic: true,
  jobTitle: "",
  jobTitlePublic: true,
  department: "",
  departmentPublic: true,
  imageUrl: "",
  imageDataUrl: "",
};

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toBoolean(value: unknown) {
  return value === true;
}

// 추가 정보 아코디언 헤더의 "입력 N/7" 표시용. 7개 의미 버킷 중 하나라도
// 값이 있으면 채워진 것으로 센다(값 자체는 노출하지 않는다).
function countAdditionalFilled(p: MeProfile): number {
  const has = (v: string) => v.trim() !== "";
  const buckets = [
    has(p.phone),
    has(p.email),
    has(p.address),
    has(p.birthday),
    has(p.elementarySchool) || has(p.middleSchool) || has(p.highSchool),
    has(p.schoolName) || has(p.major) || has(p.studentId) || has(p.universityMajor),
    has(p.companyName) || has(p.jobTitle) || has(p.department) || has(p.company),
  ];
  return buckets.filter(Boolean).length;
}

// 공개 boolean 복원 규칙(true=공개):
// 1) 저장된 boolean 이 있으면 그대로 보존 → 기존 공개/비공개 상태 유지(자동 공개 금지)
// 2) boolean 이 없고 값이 이미 있으면 false → 기존 데이터 보호(비공개)
// 3) boolean 도 값도 없으면 true → 새로 입력할 빈 필드는 기본 공개
function resolvePublicValue(value: string, ...sources: unknown[]): boolean {
  for (const source of sources) {
    if (typeof source === "boolean") return source;
  }
  return value.trim() === "";
}

function buildProfileFromUnknown(source: Partial<MeProfile> & Record<string, unknown>): MeProfile {
  const university = toText(source.university);
  const legacyMajor = toText(source.major);
  const universityMajor =
    toText(source.universityMajor) ||
    [university, legacyMajor].filter(Boolean).join(" / ");
  const company = toText(source.company);

  // 단일 → 분리 fallback. 기존 단일 값을 학교명/회사명에 통째로 보존(임의 분리 금지).
  const schoolName = toText(source.schoolName) || universityMajor;
  const major = toText(source.major);
  const studentId = toText(source.studentId);
  const companyName = toText(source.companyName) || company;
  const jobTitle = toText(source.jobTitle);
  const department = toText(source.department);

  const phone = toText(source.phone) || toText(source.contact);
  const email = toText(source.email);
  const address = toText(source.address);
  const birthday = toText(source.birthday);
  const elementarySchool = toText(source.elementarySchool);
  const middleSchool = toText(source.middleSchool);
  const highSchool = toText(source.highSchool);

  return {
    name: toText(source.name),
    phone,
    phonePublic: resolvePublicValue(phone, source.phonePublic),
    email,
    emailPublic: resolvePublicValue(email, source.emailPublic),
    address,
    addressPublic: resolvePublicValue(address, source.addressPublic),
    birthday,
    birthdayPublic: resolvePublicValue(birthday, source.birthdayPublic),
    elementarySchool,
    elementarySchoolPublic: resolvePublicValue(elementarySchool, source.elementarySchoolPublic),
    middleSchool,
    middleSchoolPublic: resolvePublicValue(middleSchool, source.middleSchoolPublic),
    highSchool,
    highSchoolPublic: resolvePublicValue(highSchool, source.highSchoolPublic),
    universityMajor,
    universityMajorPublic: resolvePublicValue(
      universityMajor,
      source.universityMajorPublic,
      source.universityPublic,
    ),
    company,
    companyPublic: resolvePublicValue(company, source.companyPublic),
    schoolName,
    // 기존 universityMajorPublic 을 학교명 공개 상태의 fallback 으로 계승.
    schoolNamePublic: resolvePublicValue(
      schoolName,
      source.schoolNamePublic,
      source.universityMajorPublic,
      source.universityPublic,
    ),
    major,
    majorPublic: resolvePublicValue(major, source.majorPublic),
    studentId,
    studentIdPublic: resolvePublicValue(studentId, source.studentIdPublic),
    companyName,
    // 기존 companyPublic 을 회사명 공개 상태의 fallback 으로 계승.
    companyNamePublic: resolvePublicValue(
      companyName,
      source.companyNamePublic,
      source.companyPublic,
    ),
    jobTitle,
    jobTitlePublic: resolvePublicValue(jobTitle, source.jobTitlePublic),
    department,
    departmentPublic: resolvePublicValue(department, source.departmentPublic),
    imageUrl: toText(source.imageUrl),
    imageDataUrl: toText(source.imageDataUrl),
  };
}

function getInitial(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "나";
  return trimmed.slice(0, 1);
}

function IconCamera() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CompactField({
  label,
  value,
  onChange,
  placeholder,
  checked,
  onPublicChange,
  type = "text",
  required = false,
  labelHidden = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  checked?: boolean;
  onPublicChange?: (next: boolean) => void;
  type?: string;
  required?: boolean;
  labelHidden?: boolean;
  // 값이 비어 있을 때만 라벨 옆에 작게 표시하는 포인트 힌트(예: "+5P").
  hint?: string;
}) {
  const showHint = Boolean(hint) && value.trim() === "";
  return (
    <div className="rounded-[14px] bg-white px-3 py-1 ring-1 ring-[#E2E0D8]">
      {labelHidden ? (
        <label className="sr-only">
          {label}
          {required ? " *" : ""}
        </label>
      ) : (
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-[#64748B]">
            {label}
            {required ? <span className="text-[#D94848]"> *</span> : null}
            {showHint ? (
              <span className="ml-1 rounded-full bg-[#FBF4E9] px-1.5 py-0.5 text-[10px] font-semibold text-[#C8890B]">
                {hint}
              </span>
            ) : null}
          </label>
          {onPublicChange ? (
            // P2-6C: 비공개 체크박스는 유지하되 작고 덜 튀게(연한 색/작은 박스).
            // checked=!public 매핑·onPublicChange 는 그대로 둔다.
            <label className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#A0A8B4]">
              <input
                type="checkbox"
                checked={!checked}
                onChange={(event) => onPublicChange(!event.target.checked)}
                className="h-3 w-3 accent-[#A0A8B4]"
              />
              비공개
            </label>
          ) : null}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[32px] w-full rounded-[10px] border border-transparent bg-[#F7F7F4] px-3 text-[14px] text-[#0F172A] outline-none placeholder:text-[#A9A59A] focus:border-[#4B2E83]"
        placeholder={placeholder}
      />
    </div>
  );
}

export default function DashboardMePage() {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);
  // 추가 정보는 기본 접힘(모바일 압박 완화). 단순 useState — persist 불필요.
  const [additionalOpen, setAdditionalOpen] = useState(false);
  // P2-4e-1: "초대 성공"/Point 는 기기별 localStorage(inviteDrafts) 가 아니라
  // 서버 /api/me/stats(계정 전체 dl_invites accepted) 기준으로 통일한다.
  // P2-4e-1b: 서버값 도착 전에는 로컬 fallback 을 쓰지 않고 "—"(로딩)/실패 안내로
  // 둔다. local inviteDrafts 가 기기별로 달라 초대성공 9→8 깜빡임을 유발했음.
  const [stats, setStats] = useState<
    | { status: "loading" }
    | { status: "ready"; acceptedCount: number }
    | { status: "error" }
  >({ status: "loading" });

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Step G5: monotonic upload token. Increments on every new upload start
  // and on handleResetImage so late-arriving Supabase callbacks can compare
  // their captured token against the current ref value and bail out if a
  // newer operation has invalidated them. Plain ref — no re-renders, no
  // new state/store/event introduced.
  const uploadTokenRef = useRef(0);
  const [profile, setProfile] = useState<MeProfile>(defaultProfile);
  const [isLoaded, setIsLoaded] = useState(false);
  // 사진 업로드/저장 동작에 대한 짧은 안내(성공/실패). 잠시 후 자동으로 사라지고
  // 그 아래의 "지속 상태 문구"로 복귀한다. alert/모달 없음.
  const [photoNotice, setPhotoNotice] = useState<
    { tone: "success" | "error" | "neutral"; text: string } | null
  >(null);

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(PROFILE_STORAGE_KEY) ||
        window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY_V2) ||
        window.localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY_V1);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MeProfile> & Record<string, unknown>;
        setProfile(buildProfileFromUnknown(parsed));
      } else {
        setProfile(defaultProfile);
      }
    } catch {
      setProfile(defaultProfile);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  }, [profile, isLoaded]);

  // me 이름이 바뀌면 디바운스 후 dl_invites의 박제된 snapshot 이름을
  // 일괄 복원한다. WHERE 절은 서버 측에서 inviter_user_id = me /
  // accepted_person_id = me 로 강하게 제한됨. 실패는 silent fail —
  // 사용자 흐름을 막지 않는다(toast 없음).
  useEffect(() => {
    if (!isLoaded) return;
    const trimmed = profile.name.trim();
    // 빈 값 또는 "나"(임시 placeholder)면 refresh-name 을 호출하지 않는다.
    // "나"/빈 값이 dl_invites 의 inviter_name / accepted_person_name 으로
    // 박제되는 것을 막는다.
    if (isIncompleteMeName(trimmed)) return;

    const handle = window.setTimeout(() => {
      const userId = getCurrentUserId();
      if (!userId) return;

      void fetch("/api/invites/refresh-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name: trimmed }),
      }).catch(() => {
        // silent fail
      });
    }, 800);

    return () => window.clearTimeout(handle);
  }, [profile.name, isLoaded]);

  // 사진 안내 문구는 잠시 후 자동으로 지운다 → 지속 상태 문구로 복귀.
  useEffect(() => {
    if (!photoNotice) return;
    const t = window.setTimeout(() => setPhotoNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [photoNotice]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next:
        | { status: "ready"; acceptedCount: number }
        | { status: "error" };
      try {
        const res = await fetch("/api/me/stats", { cache: "no-store" });
        const data = res.ok
          ? ((await res.json().catch(() => null)) as
              | { ok?: boolean; acceptedInvitesCount?: number }
              | null)
          : null;
        if (data?.ok && typeof data.acceptedInvitesCount === "number") {
          next = { status: "ready", acceptedCount: data.acceptedInvitesCount };
        } else {
          // 401/500/형식오류 → 로컬값으로 대체하지 않고 "확인 실패"로 둔다.
          next = { status: "error" };
        }
      } catch {
        next = { status: "error" };
      }
      if (!cancelled) setStats(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // P3-2A3: 상단 스탯 · Point · 성취도가 "같은 소스"를 쓰도록 통일한다.
  // 초대/연결은 기기별 inviteDrafts 가 아니라 화면 "초대 성공"과 동일한 서버값
  // (/api/me/stats acceptedCount)을 주 소스로 삼는다 → 같은 계정이면 PC/모바일 동일.
  const questReady = hasHydrated && isLoaded;

  // Me 진입 시 accepted 초대 read-only 서버동기(GET /api/invites/mine). people/
  // inviteDrafts 신선도 보조용(주 소스는 아래 stats). store GET-only 액션, write 없음.
  useEffect(() => {
    void usePeopleStore.getState().syncAcceptedInvitesToPeople().catch(() => {});
  }, []);

  // P3-2B-2: 신호 발송일수(KST)를 "서버 auth 기준"으로 집계해 live Point 에 반영한다.
  // GET /api/me/signal-days 는 세션 auth → user_identity_links 의 legacy sender id
  // 전체로 signals 를 집계하므로, 같은 계정이면 PC/모바일 동일 값(client 기기별 id
  // 문제 해결). 실패 시 0 으로 fallback(Point 전체를 깨지 않음).
  const [signalDayCount, setSignalDayCount] = useState(0);
  const [senderIdsCount, setSenderIdsCount] = useState(0);
  const [signalReady, setSignalReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/signal-days", { cache: "no-store" });
        const data = res.ok
          ? ((await res.json().catch(() => null)) as {
              ok?: boolean;
              signalDayCount?: number;
              senderIdsCount?: number;
            } | null)
          : null;
        if (!cancelled && data?.ok && typeof data.signalDayCount === "number") {
          setSignalDayCount(Math.max(0, data.signalDayCount));
          setSenderIdsCount(
            typeof data.senderIdsCount === "number" ? data.senderIdsCount : 0
          );
        }
      } catch {
        // 실패는 무시 → signalDayCount 0 fallback
      } finally {
        if (!cancelled) setSignalReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statsAcceptedCount =
    stats.status === "ready" ? stats.acceptedCount : 0;
  // fallback(서버 stats 준비 전): 연결된 사람(remote id 존재) 수. people 기준이라
  // 고유(≤ 사람수) → token 중복 인플레가 없다. draft 개수는 fallback 에도 쓰지 않는다.
  const connectedPeopleCount = useMemo(
    () =>
      people.filter((p) => {
        const extended = p as Record<string, unknown>;
        return Boolean(
          extended.userId ||
            extended.dlUserId ||
            extended.acceptedPersonId ||
            extended.isJoined
        );
      }).length,
    [people]
  );

  // 초대 성공 수: 주 소스 = 서버 stats(화면 "초대 성공"과 동일 값). 준비 전엔
  // 인플레 없는 fallback(connectedPeopleCount). 발송/연결 점수 모두 이 값으로 일관
  // 계산한다(기기별 draft 개수로 세면 모바일 token 중복 → 인플레 → 불일치가 됨).
  const inviteSuccessCount =
    stats.status === "ready" ? statsAcceptedCount : connectedPeopleCount;
  const inviteSentCount = inviteSuccessCount;
  const connectionCount = inviteSuccessCount;

  const hasProfileName = !isIncompleteMeName(profile.name);
  const profileFieldCount = countAdditionalFilled(profile);
  const peopleCount = people.length;
  const tieredPeopleCount = people.filter(
    (p) => typeof p.tier === "number"
  ).length;
  const hasExploreField = [
    profile.schoolName,
    profile.highSchool,
    profile.middleSchool,
    profile.elementarySchool,
    profile.universityMajor,
    profile.major,
    profile.companyName,
    profile.company,
    profile.address,
  ].some((value) => value.trim() !== "");

  // 다음 추천 행동 "1곳"에만 빨간 점(우선순위: 이름 → 추가정보 빈 필드).
  // 여러 곳을 동시에 빨갛게 만들지 않는다.
  const nextDot: "name" | "fields" | null = !hasProfileName
    ? "name"
    : profileFieldCount < 7
      ? "fields"
      : null;

  // 성취도 milestone(준비도/완료수) — Point 와 같은 통일 소스 사용.
  const questMissions = useMemo(
    () =>
      buildQuestMissions({
        hasName: hasProfileName,
        peopleCount,
        hasTieredPerson: tieredPeopleCount >= 1,
        inviteCount: inviteSentCount,
        hasExploreField,
        hasConnectedPerson: connectionCount >= 1,
      }),
    [
      hasProfileName,
      peopleCount,
      tieredPeopleCount,
      inviteSentCount,
      hasExploreField,
      connectionCount,
    ]
  );

  // Point = 통일 소스 기반 deterministic 계산(localStorage 잔액 장부 미사용).
  const pointBreakdown = useMemo(
    () =>
      buildDeterministicPointScore({
        hasName: hasProfileName,
        filledFieldCount: profileFieldCount,
        peopleCount,
        tieredCount: tieredPeopleCount,
        inviteSentCount,
        connectionCount,
        // 서버 auth 기준 계정 일치 값이므로 PC/모바일 동일 → live 반영.
        signalDayCount,
      }),
    [
      hasProfileName,
      profileFieldCount,
      peopleCount,
      tieredPeopleCount,
      inviteSentCount,
      connectionCount,
      signalDayCount,
    ]
  );
  const pointTotal = pointBreakdown.totalPoints;
  // Point 표시는 서버값(초대 성공 + 신호 발송일)을 쓰므로 stats·signal ready 후 노출.
  const pointReady = questReady && stats.status === "ready" && signalReady;

  // 🪙 효과: 초대 sync settle 후 첫 계산에서 현재 total 을 seed(효과 없음) →
  // PC 가 95→305 로 올라가는 최초 동기화 구간은 seed 로 흡수돼 폭발하지 않는다.
  // 이후 같은 기기에서 새 행동으로 total 이 증가할 때만 🪙 +N 표시.
  const [pointBurst, setPointBurst] = useState<number | null>(null);
  const effectSeededRef = useRef(false);
  useEffect(() => {
    if (!pointReady) return;
    const seen = readPointEffectSeen();
    if (!effectSeededRef.current) {
      effectSeededRef.current = true;
      writePointEffectSeen(pointTotal);
      return;
    }
    if (seen !== null && pointTotal > seen) {
      setPointBurst(pointTotal - seen);
    }
    writePointEffectSeen(pointTotal);
  }, [pointReady, pointTotal]);

  useEffect(() => {
    if (pointBurst === null) return;
    const timer = window.setTimeout(() => setPointBurst(null), 1600);
    return () => window.clearTimeout(timer);
  }, [pointBurst]);

  // debugPoint=1 쿼리일 때만 숫자 breakdown 노출(개인정보 없음, 숫자만).
  const [debugPoint, setDebugPoint] = useState(false);
  useEffect(() => {
    try {
      setDebugPoint(
        new URLSearchParams(window.location.search).get("debugPoint") === "1"
      );
    } catch {
      setDebugPoint(false);
    }
  }, []);

  function updateProfile<K extends keyof MeProfile>(key: K, value: MeProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadProfileImageToSupabase(file: File) {
    const currentUserId = getCurrentUserId();
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
    const filePath = `${currentUserId}/profile.${safeExtension}`;

    const { error } = await supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  // 내 프로필 사진 public URL 을 연결된 dl_invites 행에 전파한다.
  // 이름의 refresh-name 과 동일 패턴. 빈 문자열이면 서버 사진 컬럼이 클리어된다.
  // 실패는 silent — 사용자 흐름을 막지 않는다.
  // 결과(진단 정보)는 localStorage 에 남겨 debug-beta Photo Sync Inspector 가
  // 읽는다. full URL/base64 는 저장하지 않는다(length/host/count 만).
  function syncMyPhotoToServer(photoUrl: string, source: "upload" | "save" | "reset") {
    const userId = getCurrentUserId();
    if (!userId) return;

    const trimmed = typeof photoUrl === "string" ? photoUrl.trim() : "";

    void (async () => {
      const debug: Record<string, unknown> = {
        at: new Date().toISOString(),
        source,
        userId,
        hasPhotoUrl: Boolean(trimmed),
        photoUrlLength: trimmed.length,
        ok: false,
        status: 0,
        updatedAsInviterCount: null,
        updatedAsAcceptedCount: null,
        errorMessage: "",
      };

      try {
        const res = await fetch("/api/invites/refresh-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, photoUrl: trimmed }),
        });
        debug.status = res.status;

        const payload = (await res.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (payload && typeof payload === "object") {
          debug.ok = Boolean(payload.ok);
          debug.updatedAsInviterCount = payload.updatedAsInviterCount ?? null;
          debug.updatedAsAcceptedCount = payload.updatedAsAcceptedCount ?? null;
          if (typeof payload.message === "string") {
            debug.errorMessage = payload.message;
          }
        }
      } catch (err) {
        debug.errorMessage = err instanceof Error ? err.message : "fetch failed";
      }

      // debug 저장 실패가 Me 저장 흐름을 막으면 안 된다.
      try {
        window.localStorage.setItem(
          LAST_REFRESH_PHOTO_RESULT_KEY,
          JSON.stringify(debug),
        );
      } catch {
        // ignore debug persist failure
      }
    })();
  }

  // Storage 업로드 결과(성공/실패)를 debug-beta 가 읽도록 localStorage 에 남긴다.
  // full URL/base64/파일명 은 저장하지 않는다(host/length/유무/타입/크기만).
  // 이 debug 저장 실패가 업로드 흐름을 막으면 안 된다.
  function recordPhotoUploadResult(input: {
    ok: boolean;
    file: File | null;
    publicUrl: string;
    errorMessage: string;
  }) {
    let publicUrlHost = "";
    if (input.publicUrl) {
      try {
        publicUrlHost = new URL(input.publicUrl).host;
      } catch {
        publicUrlHost = "";
      }
    }

    const debug = {
      at: new Date().toISOString(),
      ok: input.ok,
      source: "image-change",
      fileNamePresent: Boolean(input.file?.name),
      fileType: input.file?.type ?? "",
      fileSize: input.file?.size ?? 0,
      bucket: PROFILE_IMAGE_BUCKET,
      pathPresent: Boolean(getCurrentUserId()),
      publicUrlPresent: Boolean(input.publicUrl),
      publicUrlHost,
      publicUrlLength: input.publicUrl.length,
      errorMessage: input.errorMessage,
    };

    try {
      window.localStorage.setItem(
        LAST_PHOTO_UPLOAD_RESULT_KEY,
        JSON.stringify(debug),
      );
    } catch {
      // ignore debug persist failure
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const token = ++uploadTokenRef.current;

    const previewDataUrl = await readFileAsDataUrl(file);
    if (uploadTokenRef.current !== token) return;
    setProfile((prev) => ({ ...prev, imageDataUrl: previewDataUrl }));

    try {
      const uploadedUrl = await uploadProfileImageToSupabase(file);
      if (uploadTokenRef.current !== token) return;
      // 매 업로드마다 URL 을 유니크하게(?v=) 만들어 상대 기기의 이미지 캐시를
      // 즉시 무효화한다. 동일 경로 upsert 라 URL 문자열은 그대로이기 때문.
      const syncedUrl = `${uploadedUrl}${
        uploadedUrl.includes("?") ? "&" : "?"
      }v=${Date.now()}`;
      setProfile((prev) => ({
        ...prev,
        imageUrl: syncedUrl,
        imageDataUrl: previewDataUrl,
      }));
      recordPhotoUploadResult({
        ok: true,
        file,
        publicUrl: syncedUrl,
        errorMessage: "",
      });
      setPhotoNotice({ tone: "success", text: "사진이 저장됐어요" });
      // 연결된 상대 기기에 내 사진 URL 전파.
      syncMyPhotoToServer(syncedUrl, "upload");
    } catch (error) {
      if (uploadTokenRef.current !== token) return;
      // silent 실패 제거: 실제 오류 메시지를 debug 에 남기고 화면에도 안내한다.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn("프로필 이미지 Supabase 업로드 실패:", error);
      setProfile((prev) => ({ ...prev, imageUrl: "", imageDataUrl: previewDataUrl }));
      recordPhotoUploadResult({
        ok: false,
        file,
        publicUrl: "",
        errorMessage,
      });
      setPhotoNotice({
        tone: "error",
        text: "사진 저장에 실패했어요. 다시 선택해 주세요",
      });
    }
  }

  // Step G2: small "back to default" reset. Only clears the local image
  // references so the existing fallback (initials placeholder) renders again.
  // Supabase storage object is intentionally left alone — re-upload uses the
  // same path with upsert so no orphan accumulation. PROFILE_UPDATED_EVENT
  // is dispatched by the existing save effect, which keeps the home
  // family-me tile in sync.
  function handleResetImage() {
    uploadTokenRef.current += 1;
    setProfile((prev) => ({
      ...prev,
      imageUrl: "",
      imageDataUrl: "",
    }));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    // 사진 초기화를 상대 기기에 전파(서버 사진 컬럼을 빈 값으로 클리어).
    syncMyPhotoToServer("", "reset");
  }

  if (!hasHydrated || !isLoaded) {
    return (
      <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-y-auto bg-[#F5F3EE] px-5 py-6 text-[#0F172A]">
        <section className="rounded-[24px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[15px] font-semibold">불러오는 중...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-y-auto bg-[#F5F3EE] px-4 pb-[120px] pt-5 text-[#0F172A] [overscroll-behavior-y:contain]">
      <section className="rounded-[28px] bg-[#FAFAF8] px-3 py-2.5 shadow-sm ring-1 ring-[#D3D1C7]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-bold leading-[1.2] tracking-[-0.04em]">
              {profile.name.trim() || "나"}
            </h1>
            <AccountSection />
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="relative flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-[20px] font-bold shadow-[0_8px_18px_rgba(15,23,42,0.05)] active:scale-95"
              style={{ background: PROFILE_BG, color: PROFILE_TEXT, border: `2.5px solid ${PROFILE_BORDER}` }}
              aria-label="프로필 사진 변경"
            >
              {profile.imageUrl || profile.imageDataUrl ? (
                <img src={profile.imageUrl || profile.imageDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitial(profile.name)
              )}
              <span className="absolute bottom-[-1px] right-[-1px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#2C2C2A] text-[#F1EFE8] ring-2 ring-[#FAFAF8]">
                <IconCamera />
              </span>
            </button>

            {(profile.imageUrl || profile.imageDataUrl) ? (
              <button
                type="button"
                onClick={handleResetImage}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#D3D1C7] bg-white text-[12px] font-bold leading-none text-[#64748B] active:scale-95"
                aria-label="사진 초기화"
                title="사진 초기화"
              >
                ×
              </button>
            ) : null}

            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>
        </div>
        {photoNotice?.tone === "error" ? (
          <p className="mt-2 text-[12px] font-medium text-[#D94848]">{photoNotice.text}</p>
        ) : null}
      </section>

      <section className="mt-2 rounded-[28px] bg-[#FAFAF8] px-3 py-2 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="flex items-center gap-1.5 text-[18px] font-bold">
          <span>
            이름 <span className="text-[#D94848]">*</span>
          </span>
          {nextDot === "name" ? (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-[8px] w-[8px] rounded-full bg-[#E5484D]"
              />
              <span className="rounded-full bg-[#FBF4E9] px-1.5 py-0.5 text-[11px] font-semibold text-[#C8890B]">
                +10P
              </span>
            </>
          ) : null}
        </h2>
        <div className="mt-2">
          <CompactField
            label="이름"
            labelHidden
            value={profile.name}
            onChange={(value) => updateProfile("name", value)}
            placeholder="이름"
            required
          />
        </div>
      </section>

      <section className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-2 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">친구들</p>
          <p className="mt-1 text-[22px] font-bold">{people.length}</p>
        </div>
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-2 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">초대 성공</p>
          <p className="mt-1 text-[22px] font-bold">
            {stats.status === "ready" ? stats.acceptedCount : "—"}
          </p>
        </div>
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-2 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">Point</p>
          <p className="mt-1 text-[22px] font-bold">
            {pointReady ? pointTotal : "—"}
          </p>
        </div>
      </section>
      {stats.status === "error" && (
        <p className="mt-1 px-1 text-[11px] text-[#8D99AE]">
          통계를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.
        </p>
      )}

      {/* P3-1B: 인맥지도 성취도(튜토리얼 진행상황). Home 의 큰 카드를 Me 로 옮겨
          "성취도"처럼 보게 한다. computed-only · 서버 write 없음 · 준비 점수는
          실제 지급/코인이 아니다. */}
      <QuestAchievementCard
        missions={questMissions}
        pointTotal={pointTotal}
        burstPoints={pointBurst}
      />
      {debugPoint ? (
        <p className="mt-1 px-1 text-[10px] leading-relaxed text-[#B7BEC8]">
          debug · fields {profileFieldCount} · people {peopleCount} · tier{" "}
          {tieredPeopleCount} · sent {inviteSentCount} · success{" "}
          {inviteSuccessCount} · conn {connectionCount} · signalDays{" "}
          {signalDayCount} · signalPts {signalDayCount * 5} · senders{" "}
          {senderIdsCount} · total {pointTotal}
        </p>
      ) : null}

      <section className="mt-2 rounded-[24px] bg-[#FAFAF8] p-3 shadow-sm ring-1 ring-[#E2E0D8]">
        {/* P3-1C: 추가 정보를 기본 접힘 아코디언으로. 헤더에 "입력 N/7"만 노출하고
            펼치면 기존 입력 폼(값·비공개 체크박스·저장 로직) 그대로 사용한다. */}
        <button
          type="button"
          onClick={() => setAdditionalOpen((value) => !value)}
          aria-expanded={additionalOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[16px] font-bold text-[#334155]">추가 정보</span>
            <span className="shrink-0 rounded-full bg-[#EFEDE6] px-2 py-0.5 text-[11px] font-semibold text-[#8D99AE]">
              입력 {countAdditionalFilled(profile)}/7
            </span>
            {nextDot === "fields" ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block h-[8px] w-[8px] shrink-0 rounded-full bg-[#E5484D]"
                />
                <span className="shrink-0 rounded-full bg-[#FBF4E9] px-1.5 py-0.5 text-[11px] font-semibold text-[#C8890B]">
                  +5P
                </span>
              </>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-[15px] leading-none text-[#A0A8B4] transition-transform ${
              additionalOpen ? "rotate-180" : ""
            }`}
          >
            ⌄
          </span>
        </button>
        {additionalOpen ? (
        <>
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          <CompactField label="전화번호" hint="+5P" value={profile.phone} onChange={(value) => updateProfile("phone", value)} placeholder="휴대폰 번호" checked={profile.phonePublic} onPublicChange={(next) => updateProfile("phonePublic", next)} />
          <CompactField label="이메일" hint="+5P" value={profile.email} onChange={(value) => updateProfile("email", value)} placeholder="이메일" checked={profile.emailPublic} onPublicChange={(next) => updateProfile("emailPublic", next)} />
          <CompactField label="주소" hint="+5P" value={profile.address} onChange={(value) => updateProfile("address", value)} placeholder="주소" checked={profile.addressPublic} onPublicChange={(next) => updateProfile("addressPublic", next)} />
          <CompactField label="생일" hint="+5P" type="date" value={profile.birthday} onChange={(value) => updateProfile("birthday", value)} placeholder="생일" checked={profile.birthdayPublic} onPublicChange={(next) => updateProfile("birthdayPublic", next)} />
          <CompactField label="초등학교" value={profile.elementarySchool} onChange={(value) => updateProfile("elementarySchool", value)} placeholder="초등학교" checked={profile.elementarySchoolPublic} onPublicChange={(next) => updateProfile("elementarySchoolPublic", next)} />
          <CompactField label="중학교" value={profile.middleSchool} onChange={(value) => updateProfile("middleSchool", value)} placeholder="중학교" checked={profile.middleSchoolPublic} onPublicChange={(next) => updateProfile("middleSchoolPublic", next)} />
          <CompactField label="고등학교" value={profile.highSchool} onChange={(value) => updateProfile("highSchool", value)} placeholder="고등학교" checked={profile.highSchoolPublic} onPublicChange={(next) => updateProfile("highSchoolPublic", next)} />
          {/* P2-6C: 대학교/회사 그룹은 강한 box-in-box 대신 소제목 + 왼쪽 연한
              구분선 + 여백으로 묶는다(중첩 border 약화). 필드/저장 구조는 그대로. */}
          <div>
            <p className="flex items-center gap-1 text-[12px] font-semibold text-[#64748B]">
              대학교
              {!(
                profile.schoolName.trim() ||
                profile.major.trim() ||
                profile.studentId.trim() ||
                profile.universityMajor.trim()
              ) ? (
                <span className="rounded-full bg-[#FBF4E9] px-1.5 py-0.5 text-[10px] font-semibold text-[#C8890B]">
                  +5P
                </span>
              ) : null}
            </p>
            <div className="mt-1 space-y-1.5 border-l-2 border-[#E2E0D8] pl-2.5">
              <CompactField label="학교명" value={profile.schoolName} onChange={(value) => updateProfile("schoolName", value)} placeholder="학교명" checked={profile.schoolNamePublic} onPublicChange={(next) => updateProfile("schoolNamePublic", next)} />
              <CompactField label="학과" value={profile.major} onChange={(value) => updateProfile("major", value)} placeholder="학과" checked={profile.majorPublic} onPublicChange={(next) => updateProfile("majorPublic", next)} />
              <CompactField label="학번" value={profile.studentId} onChange={(value) => updateProfile("studentId", value)} placeholder="학번" checked={profile.studentIdPublic} onPublicChange={(next) => updateProfile("studentIdPublic", next)} />
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[12px] font-semibold text-[#64748B]">
              회사
              {!(
                profile.companyName.trim() ||
                profile.jobTitle.trim() ||
                profile.department.trim() ||
                profile.company.trim()
              ) ? (
                <span className="rounded-full bg-[#FBF4E9] px-1.5 py-0.5 text-[10px] font-semibold text-[#C8890B]">
                  +5P
                </span>
              ) : null}
            </p>
            <div className="mt-1 space-y-1.5 border-l-2 border-[#E2E0D8] pl-2.5">
              <CompactField label="회사명" value={profile.companyName} onChange={(value) => updateProfile("companyName", value)} placeholder="회사명" checked={profile.companyNamePublic} onPublicChange={(next) => updateProfile("companyNamePublic", next)} />
              <CompactField label="직위" value={profile.jobTitle} onChange={(value) => updateProfile("jobTitle", value)} placeholder="직위" checked={profile.jobTitlePublic} onPublicChange={(next) => updateProfile("jobTitlePublic", next)} />
              <CompactField label="부서" value={profile.department} onChange={(value) => updateProfile("department", value)} placeholder="부서" checked={profile.departmentPublic} onPublicChange={(next) => updateProfile("departmentPublic", next)} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
          window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

          // 명시 저장 시점에 refresh-name 을 즉시(디바운스 없이) 호출한다.
          // 디바운스 effect 는 800ms 전 화면 이탈 시 cleanup 으로 취소될 수 있어,
          // 상대에게 새 이름이 전달되지 않는 경우를 방지한다. "나"/빈 값은 제외.
          const trimmedName = profile.name.trim();
          if (!isIncompleteMeName(trimmedName)) {
            const userId = getCurrentUserId();
            if (userId) {
              void fetch("/api/invites/refresh-name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, name: trimmedName }),
              }).catch(() => {
                // silent fail
              });
            }
          }

          // 저장 시 현재 사진도 재동기화한다. 사진을 먼저 설정한 뒤 나중에
          // 연결된 경우, 저장 한 번으로 기존 dl_invites 행에 채워 넣을 수 있다.
          // state 의 imageUrl 이 비어 있어도 localStorage 에 public URL 이 있으면
          // 그것으로 fallback 한다(public URL 만; imageDataUrl/base64 는 제외).
          const photoToSync = profile.imageUrl || readMeProfileImageUrl();
          syncMyPhotoToServer(photoToSync, "save");
          if (photoToSync) {
            setPhotoNotice({
              tone: "success",
              text: "저장했어요 · 사진도 연결된 사람에게 반영돼요",
            });
          } else if (profile.imageDataUrl) {
            setPhotoNotice({
              tone: "neutral",
              text: "사진을 다시 선택하면 다른 기기에도 보여요",
            });
          } else {
            setPhotoNotice({ tone: "success", text: "저장했어요" });
          }
        }}
        className="inline-flex w-fit items-center justify-center rounded-full border border-[#D3D1C7] bg-white px-3 py-2 text-[13px] font-semibold text-[#4B5563] active:scale-[0.98]"
      >
        저장
      </button>
        </div>
        </>
        ) : null}
      </section>
    </main>
  );
}
