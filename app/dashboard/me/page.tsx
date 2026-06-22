"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { isIncompleteMeName, readMeProfileImageUrl } from "@/lib/me/profile-name";
import { usePeopleStore } from "../people/store";
import { AccountSection } from "./account-section";

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
}) {
  return (
    <div className="rounded-[16px] bg-white px-3 py-1.5 ring-1 ring-[#D3D1C7]">
      {labelHidden ? (
        <label className="sr-only">
          {label}
          {required ? " *" : ""}
        </label>
      ) : (
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-[#64748B]">
            {label}
            {required ? <span className="text-[#D94848]"> *</span> : null}
          </label>
          {onPublicChange ? (
            <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#64748B]">
              <input
                type="checkbox"
                checked={!checked}
                onChange={(event) => onPublicChange(!event.target.checked)}
                className="h-3.5 w-3.5 accent-[#4B2E83]"
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
        className="h-[34px] w-full rounded-[12px] border border-transparent bg-[#F7F7F4] px-3 text-[14px] text-[#0F172A] outline-none placeholder:text-[#A9A59A] focus:border-[#4B2E83]"
        placeholder={placeholder}
      />
    </div>
  );
}

export default function DashboardMePage() {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

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

  const acceptedInviteCount = useMemo(() => {
    return inviteDrafts.filter((draft) => draft.status === "accepted").length;
  }, [inviteDrafts]);

  const linkPoint = useMemo(() => {
    const filled = [
      profile.name,
      profile.phone,
      profile.email,
      profile.address,
      profile.birthday,
      profile.elementarySchool,
      profile.middleSchool,
      profile.highSchool,
      profile.universityMajor,
      profile.company,
      profile.imageUrl,
      profile.imageDataUrl,
    ].some((value) => value.trim());

    return acceptedInviteCount * 10 + people.length * 3 + (filled ? 5 : 0);
  }, [acceptedInviteCount, people.length, profile]);

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
        <h2 className="text-[18px] font-bold">
          이름 <span className="text-[#D94848]">*</span>
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
          <p className="mt-1 text-[22px] font-bold">{acceptedInviteCount}</p>
        </div>
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-2 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">Point</p>
          <p className="mt-1 text-[22px] font-bold">{linkPoint}</p>
        </div>
      </section>

      <section className="mt-2 rounded-[28px] bg-[#FAFAF8] p-3 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="text-[18px] font-bold">추가 정보</h2>
        <div className="mt-2 grid grid-cols-1 gap-2">
          <CompactField label="전화번호" value={profile.phone} onChange={(value) => updateProfile("phone", value)} placeholder="휴대폰 번호" checked={profile.phonePublic} onPublicChange={(next) => updateProfile("phonePublic", next)} />
          <CompactField label="이메일" value={profile.email} onChange={(value) => updateProfile("email", value)} placeholder="이메일" checked={profile.emailPublic} onPublicChange={(next) => updateProfile("emailPublic", next)} />
          <CompactField label="주소" value={profile.address} onChange={(value) => updateProfile("address", value)} placeholder="주소" checked={profile.addressPublic} onPublicChange={(next) => updateProfile("addressPublic", next)} />
          <CompactField label="생일" type="date" value={profile.birthday} onChange={(value) => updateProfile("birthday", value)} placeholder="생일" checked={profile.birthdayPublic} onPublicChange={(next) => updateProfile("birthdayPublic", next)} />
          <CompactField label="초등학교" value={profile.elementarySchool} onChange={(value) => updateProfile("elementarySchool", value)} placeholder="초등학교" checked={profile.elementarySchoolPublic} onPublicChange={(next) => updateProfile("elementarySchoolPublic", next)} />
          <CompactField label="중학교" value={profile.middleSchool} onChange={(value) => updateProfile("middleSchool", value)} placeholder="중학교" checked={profile.middleSchoolPublic} onPublicChange={(next) => updateProfile("middleSchoolPublic", next)} />
          <CompactField label="고등학교" value={profile.highSchool} onChange={(value) => updateProfile("highSchool", value)} placeholder="고등학교" checked={profile.highSchoolPublic} onPublicChange={(next) => updateProfile("highSchoolPublic", next)} />
          <div>
            <p className="text-[12px] font-semibold text-[#64748B]">대학교</p>
            <div className="mt-1 space-y-2 rounded-[20px] border border-[#D3D1C7] p-3">
              <CompactField label="학교명" value={profile.schoolName} onChange={(value) => updateProfile("schoolName", value)} placeholder="학교명" checked={profile.schoolNamePublic} onPublicChange={(next) => updateProfile("schoolNamePublic", next)} />
              <CompactField label="학과" value={profile.major} onChange={(value) => updateProfile("major", value)} placeholder="학과" checked={profile.majorPublic} onPublicChange={(next) => updateProfile("majorPublic", next)} />
              <CompactField label="학번" value={profile.studentId} onChange={(value) => updateProfile("studentId", value)} placeholder="학번" checked={profile.studentIdPublic} onPublicChange={(next) => updateProfile("studentIdPublic", next)} />
            </div>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#64748B]">회사</p>
            <div className="mt-1 space-y-2 rounded-[20px] border border-[#D3D1C7] p-3">
              <CompactField label="회사명" value={profile.companyName} onChange={(value) => updateProfile("companyName", value)} placeholder="회사명" checked={profile.companyNamePublic} onPublicChange={(next) => updateProfile("companyNamePublic", next)} />
              <CompactField label="직위" value={profile.jobTitle} onChange={(value) => updateProfile("jobTitle", value)} placeholder="직위" checked={profile.jobTitlePublic} onPublicChange={(next) => updateProfile("jobTitlePublic", next)} />
              <CompactField label="부서" value={profile.department} onChange={(value) => updateProfile("department", value)} placeholder="부서" checked={profile.departmentPublic} onPublicChange={(next) => updateProfile("departmentPublic", next)} />
            </div>
          </div>
        </div>
      </section>

      <p className="mt-2 text-center text-[12px] font-medium leading-5 text-[#8D99AE]">
        입력 내용은 자동 저장됩니다.
      </p>

      <div className="mt-2 flex justify-end">
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
        className="inline-flex h-11 w-auto items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white active:scale-[0.98]"
      >
        저장하기
      </button>
      </div>
    </main>
  );
}
