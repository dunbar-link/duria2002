"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AddDashboardPersonInput, RelationshipType } from "../data";
import { usePeopleStore } from "../store";

const tierOptions: Array<{
  value: AddDashboardPersonInput["tier"];
  label: string;
}> = [
  { value: 1, label: "가족" },
  { value: 5, label: "핵심" },
  { value: 15, label: "신뢰" },
  { value: 50, label: "친밀" },
  { value: 150, label: "친근" },
];

const relationshipTypeOptions: Array<{
  value: RelationshipType;
  label: string;
}> = [
  { value: "friend", label: "친구" },
  { value: "family", label: "가족" },
  { value: "school", label: "학교" },
  { value: "work", label: "직장" },
  { value: "senior_junior", label: "선후배" },
  { value: "business", label: "거래처" },
  { value: "other", label: "기타" },
];

type FormState = {
  name: string;
  tier: AddDashboardPersonInput["tier"];
  relationshipType: RelationshipType;
  relationshipCustomLabel: string;
  relationshipDetail: string;
  affiliationPrimary: string;
  affiliationSecondary: string;
  phone: string;
  kakaoTalkUrl: string;
  whatsappPhone: string;
  telegramUsername: string;
  lineId: string;
  instagramUsername: string;
  messengerUsername: string;
  note: string;
};

const initialFormState: FormState = {
  name: "",
  tier: 5,
  relationshipType: "friend",
  relationshipCustomLabel: "",
  relationshipDetail: "",
  affiliationPrimary: "",
  affiliationSecondary: "",
  phone: "",
  kakaoTalkUrl: "",
  whatsappPhone: "",
  telegramUsername: "",
  lineId: "",
  instagramUsername: "",
  messengerUsername: "",
  note: "",
};

function buildRelationshipLabel(form: FormState) {
  const custom = form.relationshipCustomLabel.trim();

  if (custom) {
    return custom;
  }

  const selected = relationshipTypeOptions.find(
    (option) => option.value === form.relationshipType,
  );

  return selected?.label ?? "친구";
}

function buildPayload(form: FormState): AddDashboardPersonInput {
  return {
    name: form.name.trim(),
    tier: form.tier,
    relationshipType: form.relationshipType,
    roleLabel: buildRelationshipLabel(form),
    relationshipDetail: form.relationshipDetail.trim(),
    affiliationPrimary: form.affiliationPrimary.trim(),
    affiliationSecondary: form.affiliationSecondary.trim(),
    phone: form.phone.trim(),
    kakaoTalkUrl: form.kakaoTalkUrl.trim(),
    whatsappPhone: form.whatsappPhone.trim(),
    telegramUsername: form.telegramUsername.trim(),
    lineId: form.lineId.trim(),
    instagramUsername: form.instagramUsername.trim(),
    messengerUsername: form.messengerUsername.trim(),
    note: form.note.trim(),
  };
}

export default function AddPersonPage() {
  const router = useRouter();
  const addPerson = usePeopleStore((state) => state.addPerson);

  const [form, setForm] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const relationshipLabelPreview = useMemo(() => {
    return buildRelationshipLabel(form);
  }, [form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(initialFormState);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const trimmedName = form.name.trim();

    if (!trimmedName) {
      setFeedback("이름은 꼭 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = buildPayload(form);
      addPerson(payload);
      setFeedback("직접 등록으로 저장했어요.");
      resetForm();

      window.setTimeout(() => {
        router.push("/dashboard/people");
      }, 350);
    } finally {
      window.setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-28">
      <div className="mx-auto max-w-3xl px-5 pb-10 pt-6">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/people"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
          >
            뒤로
          </Link>

          <Link
            href="/dashboard/people/invite"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            초대 보내기
          </Link>
        </div>

        <div className="mt-5 rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold text-slate-500">직접 추가는 보조 흐름</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            직접 등록
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            이제 기본 방향은
            <br />
            내가 친구 정보를 대신 많이 넣는 방식보다
            <br />
            <span className="font-semibold text-slate-900">초대 링크를 보내고 상대가 직접 입력하는 방식</span>
            이다.
            <br />
            이 화면은 아직 필요한 경우만 쓰는 보조 입력 화면이다.
          </p>

          <div className="mt-5 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-900">추천 흐름</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              초대 링크를 만들고
              <br />
              문자 / 카카오 등으로 보내고
              <br />
              상대가 자기 정보를 직접 입력하게 한다.
            </p>

            <div className="mt-4">
              <Link
                href="/dashboard/people/invite"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                초대 링크 만들기
              </Link>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-5 rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-200"
        >
          <div>
            <p className="text-sm font-semibold text-slate-500">보조 수동 입력</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              직접 추가하기
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              지금 단계에서는 필요할 때만 직접 등록해도 된다.
            </p>
          </div>

          {feedback ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
              {feedback}
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-slate-800">이름</label>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="예: 민수"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">관계 레이어</label>
                <select
                  value={form.tier}
                  onChange={(event) =>
                    updateField("tier", Number(event.target.value) as FormState["tier"])
                  }
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-300"
                >
                  {tierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">관계 유형</label>
                <select
                  value={form.relationshipType}
                  onChange={(event) =>
                    updateField(
                      "relationshipType",
                      event.target.value as RelationshipType,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-slate-300"
                >
                  {relationshipTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                관계명 직접 입력
              </label>
              <input
                value={form.relationshipCustomLabel}
                onChange={(event) =>
                  updateField("relationshipCustomLabel", event.target.value)
                }
                placeholder="예: 대학 동기, 사촌누나, 전 직장 동료"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
              <p className="mt-2 text-xs text-slate-500">
                현재 표시될 관계명: {relationshipLabelPreview}
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">연결고리</label>
              <input
                value={form.relationshipDetail}
                onChange={(event) =>
                  updateField("relationshipDetail", event.target.value)
                }
                placeholder="예: 군대에서 만남, 프로젝트 같이 함"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">소속 1</label>
                <input
                  value={form.affiliationPrimary}
                  onChange={(event) =>
                    updateField("affiliationPrimary", event.target.value)
                  }
                  placeholder="예: 부산대학교"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">소속 2</label>
                <input
                  value={form.affiliationSecondary}
                  onChange={(event) =>
                    updateField("affiliationSecondary", event.target.value)
                  }
                  placeholder="예: 마케팅팀"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">전화번호</label>
                <input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">
                  카카오 링크
                </label>
                <input
                  value={form.kakaoTalkUrl}
                  onChange={(event) =>
                    updateField("kakaoTalkUrl", event.target.value)
                  }
                  placeholder="예: https://open.kakao.com/..."
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">
                  WhatsApp 번호
                </label>
                <input
                  value={form.whatsappPhone}
                  onChange={(event) =>
                    updateField("whatsappPhone", event.target.value)
                  }
                  placeholder="예: +82 10 1234 5678"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">
                  Telegram 아이디
                </label>
                <input
                  value={form.telegramUsername}
                  onChange={(event) =>
                    updateField("telegramUsername", event.target.value)
                  }
                  placeholder="예: mytelegramid"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">LINE 아이디</label>
                <input
                  value={form.lineId}
                  onChange={(event) => updateField("lineId", event.target.value)}
                  placeholder="예: mylineid"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">
                  Instagram 아이디
                </label>
                <input
                  value={form.instagramUsername}
                  onChange={(event) =>
                    updateField("instagramUsername", event.target.value)
                  }
                  placeholder="예: myinsta"
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">
                Messenger 아이디
              </label>
              <input
                value={form.messengerUsername}
                onChange={(event) =>
                  updateField("messengerUsername", event.target.value)
                }
                placeholder="예: mymessengerid"
                className="mt-2 h-12 w-full rounded-2xl border-0 bg-slate-100 px-4 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-800">짧은 메모</label>
              <textarea
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
                placeholder="예: 오랜만에 안부 보내면 좋음"
                rows={4}
                className="mt-2 w-full rounded-2xl border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
              />
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? "저장 중..." : "직접 등록 저장"}
            </button>

            <Link
              href="/dashboard/people/invite"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              대신 초대 링크 만들기
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}