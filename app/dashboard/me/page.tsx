"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserId } from "@/lib/auth/current-user";
import { usePeopleStore } from "../people/store";

const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v1";
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
  bio: string;
  contact: string;
  visibility: "핵심만" | "신뢰까지" | "전체";
  imageUrl: string;
  imageDataUrl: string;
};

const defaultProfile: MeProfile = {
  name: "나",
  bio: "",
  contact: "",
  visibility: "핵심만",
  imageUrl: "",
  imageDataUrl: "",
};

function getInitial(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "나";
  return trimmed.slice(0, 1);
}

function IconCamera() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[20px] w-[20px]"
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

export default function DashboardMePage() {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const hasHydrated = usePeopleStore((state) => state.hasHydrated);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [profile, setProfile] = useState<MeProfile>(defaultProfile);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MeProfile>;

        setProfile({
          name: parsed.name || defaultProfile.name,
          bio: parsed.bio || defaultProfile.bio,
          contact: parsed.contact || defaultProfile.contact,
          visibility: parsed.visibility || defaultProfile.visibility,
          imageUrl: parsed.imageUrl || defaultProfile.imageUrl,
          imageDataUrl: parsed.imageDataUrl || defaultProfile.imageDataUrl,
        });
      }
    } catch {
      setProfile(defaultProfile);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  }, [profile, isLoaded]);

  const acceptedInviteCount = useMemo(() => {
    return inviteDrafts.filter((draft) => draft.status === "accepted").length;
  }, [inviteDrafts]);

  const linkPoint = useMemo(() => {
    const profilePoint =
      profile.name.trim() ||
      profile.bio.trim() ||
      profile.contact.trim() ||
      profile.imageUrl ||
      profile.imageDataUrl
        ? 5
        : 0;

    return acceptedInviteCount * 10 + people.length * 3 + profilePoint;
  }, [acceptedInviteCount, people.length, profile]);

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

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };

      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const previewDataUrl = await readFileAsDataUrl(file);

    setProfile((prev) => ({
      ...prev,
      imageDataUrl: previewDataUrl,
    }));

    try {
      const uploadedUrl = await uploadProfileImageToSupabase(file);

      setProfile((prev) => ({
        ...prev,
        imageUrl: uploadedUrl,
        imageDataUrl: previewDataUrl,
      }));
    } catch (error) {
      console.warn("프로필 이미지 Supabase 업로드 실패:", error);

      setProfile((prev) => ({
        ...prev,
        imageUrl: "",
        imageDataUrl: previewDataUrl,
      }));
    }
  }

  if (!hasHydrated || !isLoaded) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col bg-[#F5F3EE] px-5 py-6 text-[#0F172A]">
        <section className="rounded-[24px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[15px] font-semibold">불러오는 중...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 bg-[#F5F3EE] px-5 pb-[120px] pt-6 text-[#0F172A]">
      <section className="rounded-[28px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
        <p className="text-[12px] font-semibold tracking-[0.22em] text-[#8D99AE]">
          DUNBAR LINK
        </p>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.04em]">
              {profile.name || "나"}
            </h1>
            <p className="mt-2 truncate text-[14px] text-[#6B7280]">
              {profile.bio || "한 줄 소개"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-[26px] font-bold shadow-[0_8px_18px_rgba(15,23,42,0.05)] active:scale-95"
            style={{
              background: PROFILE_BG,
              color: PROFILE_TEXT,
              border: `2.5px solid ${PROFILE_BORDER}`,
            }}
            aria-label="프로필 사진 변경"
          >
            {profile.imageUrl || profile.imageDataUrl ? (
              <img
                src={profile.imageUrl || profile.imageDataUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitial(profile.name)
            )}

            <span className="absolute bottom-[-1px] right-[-1px] flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#2C2C2A] text-[#F1EFE8] ring-2 ring-[#FAFAF8]">
              <IconCamera />
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-[22px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">친구들</p>
          <p className="mt-2 text-[24px] font-bold">{people.length}</p>
        </div>

        <div className="rounded-[22px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">초대 성공</p>
          <p className="mt-2 text-[24px] font-bold">{acceptedInviteCount}</p>
        </div>

        <div className="rounded-[22px] bg-[#FAFAF8] p-4 shadow-sm ring-1 ring-[#D3D1C7]">
          <p className="text-[11px] font-semibold text-[#8D99AE]">Point</p>
          <p className="mt-2 text-[24px] font-bold">{linkPoint}</p>
        </div>
      </section>

      <section className="rounded-[28px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="text-[18px] font-bold">내 정보</h2>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[12px] font-semibold text-[#64748B]">이름</span>
            <input
              value={profile.name}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, name: event.target.value }))
              }
              className="mt-2 h-12 w-full rounded-[16px] border border-[#D3D1C7] bg-white px-4 text-[15px] outline-none focus:border-[#4B2E83]"
              placeholder="이름"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-[#64748B]">한 줄 소개</span>
            <input
              value={profile.bio}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, bio: event.target.value }))
              }
              className="mt-2 h-12 w-full rounded-[16px] border border-[#D3D1C7] bg-white px-4 text-[15px] outline-none focus:border-[#4B2E83]"
              placeholder="예: 부산"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-[#64748B]">연락수단</span>
            <input
              value={profile.contact}
              onChange={(event) =>
                setProfile((prev) => ({ ...prev, contact: event.target.value }))
              }
              className="mt-2 h-12 w-full rounded-[16px] border border-[#D3D1C7] bg-white px-4 text-[15px] outline-none focus:border-[#4B2E83]"
              placeholder="카카오톡 / 전화 / 문자"
            />
          </label>
        </div>
      </section>

      <section className="rounded-[28px] bg-[#FAFAF8] p-5 shadow-sm ring-1 ring-[#D3D1C7]">
        <h2 className="text-[18px] font-bold">공개범위</h2>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["핵심만", "신뢰까지", "전체"] as const).map((value) => {
            const active = profile.visibility === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, visibility: value }))}
                className={[
                  "h-11 rounded-[16px] text-[13px] font-semibold transition active:scale-95",
                  active
                    ? "bg-[#2C2C2A] text-[#F1EFE8]"
                    : "bg-white text-[#64748B] ring-1 ring-[#D3D1C7]",
                ].join(" ")}
              >
                {value}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
