"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { usePeopleStore } from "../people/store";

const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v3";
const LEGACY_PROFILE_STORAGE_KEY_V2 = "dunbar-link-me-profile-v2";
const LEGACY_PROFILE_STORAGE_KEY_V1 = "dunbar-link-me-profile-v1";
const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";

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
  universityMajor: string;
  universityMajorPublic: boolean;
  company: string;
  companyPublic: boolean;
  imageUrl: string;
  imageDataUrl: string;
};

const defaultProfile: MeProfile = {
  name: "",
  phone: "",
  phonePublic: false,
  email: "",
  emailPublic: false,
  address: "",
  addressPublic: false,
  birthday: "",
  birthdayPublic: false,
  elementarySchool: "",
  elementarySchoolPublic: false,
  middleSchool: "",
  middleSchoolPublic: false,
  highSchool: "",
  highSchoolPublic: false,
  universityMajor: "",
  universityMajorPublic: false,
  company: "",
  companyPublic: false,
  imageUrl: "",
  imageDataUrl: "",
};

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toBoolean(value: unknown) {
  return value === true;
}

function buildProfileFromUnknown(source: Partial<MeProfile> & Record<string, unknown>): MeProfile {
  const university = toText(source.university);
  const major = toText(source.major);
  const universityMajor =
    toText(source.universityMajor) ||
    [university, major].filter(Boolean).join(" / ");

  return {
    name: toText(source.name),
    phone: toText(source.phone) || toText(source.contact),
    phonePublic: toBoolean(source.phonePublic),
    email: toText(source.email),
    emailPublic: toBoolean(source.emailPublic),
    address: toText(source.address),
    addressPublic: toBoolean(source.addressPublic),
    birthday: toText(source.birthday),
    birthdayPublic: toBoolean(source.birthdayPublic),
    elementarySchool: toText(source.elementarySchool),
    elementarySchoolPublic: toBoolean(source.elementarySchoolPublic),
    middleSchool: toText(source.middleSchool),
    middleSchoolPublic: toBoolean(source.middleSchoolPublic),
    highSchool: toText(source.highSchool),
    highSchoolPublic: toBoolean(source.highSchoolPublic),
    universityMajor,
    universityMajorPublic:
      toBoolean(source.universityMajorPublic) || toBoolean(source.universityPublic),
    company: toText(source.company),
    companyPublic: toBoolean(source.companyPublic),
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  checked?: boolean;
  onPublicChange?: (next: boolean) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="rounded-[16px] bg-white px-3 py-2 ring-1 ring-[#D3D1C7]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-[#64748B]">
          {label}
          {required ? <span className="text-[#D94848]"> *</span> : null}
        </label>
        {onPublicChange ? (
          <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#64748B]">
            <input
              type="checkbox"
              checked={Boolean(checked)}
              onChange={(event) => onPublicChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#4B2E83]"
            />
            공개
          </label>
        ) : null}
      </div>
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
  const [profile, setProfile] = useState<MeProfile>(defaultProfile);
  const [isLoaded, setIsLoaded] = useState(false);

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

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewDataUrl = await readFileAsDataUrl(file);
    setProfile((prev) => ({ ...prev, imageDataUrl: previewDataUrl }));

    try {
      const uploadedUrl = await uploadProfileImageToSupabase(file);
      setProfile((prev) => ({
        ...prev,
        imageUrl: uploadedUrl,
        imageDataUrl: previewDataUrl,
      }));
    } catch (error) {
      console.warn("프로필 이미지 Supabase 업로드 실패:", error);
      setProfile((prev) => ({ ...prev, imageUrl: "", imageDataUrl: previewDataUrl }));
    }
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
      <section className="rounded-[28px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
        <p className="text-[12px] font-semibold tracking-[0.22em] text-[#8D99AE]">
          DUNBAR LINK
        </p>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.04em]">
              {profile.name.trim() || "나"}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-[26px] font-bold shadow-[0_8px_18px_rgba(15,23,42,0.05)] active:scale-95"
            style={{ background: PROFILE_BG, color: PROFILE_TEXT, border: `2.5px solid ${PROFILE_BORDER}` }}
            aria-label="프로필 사진 변경"
          >
            {profile.imageUrl || profile.imageDataUrl ? (
              <img src={profile.imageUrl || profile.imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitial(profile.name)
            )}
            <span className="absolute bottom-[-1px] right-[-1px] flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#2C2C2A] text-[#F1EFE8] ring-2 ring-[#FAFAF8]">
              <IconCamera />
            </span>
          </button>

          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-3 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">친구들</p>
          <p className="mt-1 text-[22px] font-bold">{people.length}</p>
        </div>
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-3 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">초대 성공</p>
          <p className="mt-1 text-[22px] font-bold">{acceptedInviteCount}</p>
        </div>
        <div className="rounded-[20px] bg-[#FAFAF8] px-4 py-3 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">Point</p>
          <p className="mt-1 text-[22px] font-bold">{linkPoint}</p>
        </div>
      </section>

      <section className="mt-3 rounded-[28px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="text-[18px] font-bold">필수 정보</h2>
        <div className="mt-3">
          <CompactField
            label="이름"
            value={profile.name}
            onChange={(value) => updateProfile("name", value)}
            placeholder="이름"
            required
          />
        </div>
      </section>

      <section className="mt-3 rounded-[28px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="text-[18px] font-bold">선택 정보</h2>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <CompactField label="전화번호" value={profile.phone} onChange={(value) => updateProfile("phone", value)} placeholder="휴대폰 번호" checked={profile.phonePublic} onPublicChange={(next) => updateProfile("phonePublic", next)} />
          <CompactField label="이메일" value={profile.email} onChange={(value) => updateProfile("email", value)} placeholder="이메일" checked={profile.emailPublic} onPublicChange={(next) => updateProfile("emailPublic", next)} />
          <CompactField label="주소" value={profile.address} onChange={(value) => updateProfile("address", value)} placeholder="주소" checked={profile.addressPublic} onPublicChange={(next) => updateProfile("addressPublic", next)} />
          <CompactField label="생일" type="date" value={profile.birthday} onChange={(value) => updateProfile("birthday", value)} placeholder="생일" checked={profile.birthdayPublic} onPublicChange={(next) => updateProfile("birthdayPublic", next)} />
          <CompactField label="초등학교" value={profile.elementarySchool} onChange={(value) => updateProfile("elementarySchool", value)} placeholder="초등학교" checked={profile.elementarySchoolPublic} onPublicChange={(next) => updateProfile("elementarySchoolPublic", next)} />
          <CompactField label="중학교" value={profile.middleSchool} onChange={(value) => updateProfile("middleSchool", value)} placeholder="중학교" checked={profile.middleSchoolPublic} onPublicChange={(next) => updateProfile("middleSchoolPublic", next)} />
          <CompactField label="고등학교" value={profile.highSchool} onChange={(value) => updateProfile("highSchool", value)} placeholder="고등학교" checked={profile.highSchoolPublic} onPublicChange={(next) => updateProfile("highSchoolPublic", next)} />
          <CompactField label="대학교/전공" value={profile.universityMajor} onChange={(value) => updateProfile("universityMajor", value)} placeholder="대학교 / 전공" checked={profile.universityMajorPublic} onPublicChange={(next) => updateProfile("universityMajorPublic", next)} />
          <CompactField label="회사" value={profile.company} onChange={(value) => updateProfile("company", value)} placeholder="회사" checked={profile.companyPublic} onPublicChange={(next) => updateProfile("companyPublic", next)} />
        </div>
      </section>

      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
          window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
        }}
        className="mt-3 h-[46px] rounded-[18px] bg-[#079863] text-[15px] font-bold text-white shadow-sm active:scale-95"
      >
        저장하기
      </button>
    </main>
  );
}
