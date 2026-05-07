"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const FIXED_OWNER_USER_ID = "fa0d8146-46c1-4fab-b6ba-e1b002c62011";

type DiscoverPathNode = {
  pid: string;
  name: string;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  isCelebrity?: boolean;
};

type DiscoverOk = {
  ok: true;
  result: {
    ok?: boolean;
    found?: boolean;
    cost?: number;
    hops?: number;
    avgTrust?: number;
    bottleneckTrust?: number;
    confidence?: number;
    confidenceLabel?: string;
    error?: string;
    errorCode?: string;
    userMessage?: string;
    path?: DiscoverPathNode[];
  };
  balance_before?: number | null;
  balance_after?: number | null;
};

type DiscoverErr = {
  ok: false;
  error: string;
  errorCode?: string;
  userMessage?: string;
};

type DiscoverResponse = DiscoverOk | DiscoverErr;

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function formatScore(value: string) {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `${Math.round(num)}`;
}

function buildPathLine(path: DiscoverPathNode[]) {
  if (!path.length) return "Path unavailable";
  return path.map((node) => node.name || "Unknown").join(" → ");
}

function getErrorGuide(errorText: string, userMessage?: string) {
  if (normalizeText(userMessage)) return normalizeText(userMessage);

  const raw = normalizeText(errorText).toUpperCase();

  if (!raw) {
    return "경로를 다시 확인해주세요.";
  }

  if (raw.includes("INSUFFICIENT_COINS")) {
    return "코인이 부족합니다. 테스트 계정 지갑을 Supabase에서 충전한 뒤 다시 시도해주세요.";
  }

  if (raw.includes("WALLET") && raw.includes("NOT")) {
    return "지갑이 아직 없습니다. 테스트 계정용 dl_wallets 행을 먼저 만들어주세요.";
  }

  if (raw.includes("TARGET")) {
    return "타겟 정보가 올바르지 않습니다. 추천 카드에서 다시 진입해 주세요.";
  }

  return errorText;
}

function getTargetBadge(category: string) {
  const normalized = normalizeText(category).toLowerCase();
  if (normalized.includes("celeb")) return "Celebrity";
  if (normalized.includes("public")) return "Public Figure";
  if (normalized.includes("person")) return "Person";
  return category || "Target";
}

function getConfidenceTone(label: string) {
  const normalized = normalizeText(label).toLowerCase();
  if (normalized.includes("excellent")) {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200";
  }
  if (normalized.includes("good")) {
    return "bg-blue-100 text-blue-700 ring-blue-200";
  }
  if (normalized.includes("fair")) {
    return "bg-amber-100 text-amber-700 ring-amber-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function getLastPathName(path: DiscoverPathNode[]) {
  if (!Array.isArray(path) || path.length === 0) return "";
  return normalizeText(path[path.length - 1]?.name);
}

function isPlaceholderTargetName(name: string) {
  const normalized = normalizeText(name).toLowerCase();
  return !normalized || normalized === "target" || normalized === "unknown";
}

function statValueClass(value: string) {
  if (value === "-" || !value) return "text-slate-400";
  return "text-slate-950";
}

function slugifyFileName(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "dunbar-link-share";
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function PathSharePageContent() {
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [origin, setOrigin] = useState("");
  const [sharing, setSharing] = useState(false);

  const [result, setResult] = useState<DiscoverOk["result"] | null>(null);
  const [balanceBefore, setBalanceBefore] = useState<number | null>(null);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);

  const ownerUserId =
    normalizeText(searchParams.get("ownerUserId")) || FIXED_OWNER_USER_ID;
  const targetPid = normalizeText(searchParams.get("targetPid"));
  const urlTargetName = normalizeText(searchParams.get("targetName"));
  const targetCategory = normalizeText(searchParams.get("targetCategory")) || "person";
  const recScore = formatScore(normalizeText(searchParams.get("recScore")));
  const recReason = normalizeText(searchParams.get("recReason"));
  const recSourceHint = normalizeText(searchParams.get("recSourceHint"));
  const captureMode = searchParams.get("capture") === "1";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let active = true;

    async function runDiscover() {
      if (!targetPid) {
        setErrorMessage("targetPid 가 없습니다. 추천 카드 또는 path 페이지에서 다시 진입해주세요.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/path/discover", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId,
            targetPid,
          }),
        });

        const data = (await response.json()) as DiscoverResponse;

        if (!active) return;

        if (!response.ok || !data.ok) {
          const message =
            "error" in data && data.error
              ? data.error
              : "공유용 경로 조회 중 오류가 발생했습니다.";
          const userMessage =
            "userMessage" in data ? normalizeText(data.userMessage) : "";
          setErrorMessage(getErrorGuide(message, userMessage));
          setResult(null);
          setBalanceBefore(null);
          setBalanceAfter(null);
          setLoading(false);
          return;
        }

        setResult(data.result);
        setBalanceBefore(data.balance_before ?? null);
        setBalanceAfter(data.balance_after ?? null);

        if (data.result?.ok === false || data.result?.found === false) {
          setErrorMessage(
            getErrorGuide(
              data.result?.error || "경로를 찾지 못했습니다.",
              data.result?.userMessage
            )
          );
        } else {
          setErrorMessage("");
        }

        setLoading(false);
      } catch (error) {
        if (!active) return;
        setResult(null);
        setBalanceBefore(null);
        setBalanceAfter(null);
        setErrorMessage(
          getErrorGuide(
            error instanceof Error
              ? error.message
              : "공유용 경로 조회 중 알 수 없는 오류가 발생했습니다."
          )
        );
        setLoading(false);
      }
    }

    runDiscover();

    return () => {
      active = false;
    };
  }, [ownerUserId, targetPid]);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(""), 2200);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const found = Boolean(result?.ok !== false && result?.found);
  const hops = result?.hops;
  const hopsText = typeof hops === "number" ? `${hops}단계` : "경로 미확인";
  const confidenceLabel = normalizeText(result?.confidenceLabel) || "";
  const confidenceValue =
    typeof result?.confidence === "number" ? `${Math.round(result.confidence)}%` : "";
  const avgTrust =
    typeof result?.avgTrust === "number" ? result.avgTrust.toFixed(2) : "-";
  const bottleneckTrust =
    typeof result?.bottleneckTrust === "number" ? `${result.bottleneckTrust}` : "-";
  const cost = typeof result?.cost === "number" ? `${result.cost}` : "-";
  const path = Array.isArray(result?.path) ? result.path : [];
  const pathLine = buildPathLine(path);

  const resolvedTargetName = useMemo(() => {
    const lastPathName = getLastPathName(path);
    if (isPlaceholderTargetName(urlTargetName) && lastPathName) {
      return lastPathName;
    }
    if (urlTargetName) return urlTargetName;
    if (lastPathName) return lastPathName;
    return "Unknown Target";
  }, [urlTargetName, path]);

  const capturePath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("ownerUserId", ownerUserId);
    params.set("targetPid", targetPid);
    params.set("targetName", resolvedTargetName);
    params.set("targetCategory", targetCategory);
    if (recScore) params.set("recScore", recScore);
    if (recReason) params.set("recReason", recReason);
    if (recSourceHint) params.set("recSourceHint", recSourceHint);
    params.set("capture", "1");
    return `/path/share?${params.toString()}`;
  }, [
    ownerUserId,
    targetPid,
    resolvedTargetName,
    targetCategory,
    recScore,
    recReason,
    recSourceHint,
  ]);

  const fullShareUrl = origin ? `${origin}${capturePath}` : capturePath;
  const shareTitle = `Dunbar Link - ${resolvedTargetName}`;
  const shareText = `나는 ${resolvedTargetName}까지 ${hopsText}입니다.`;

  async function createCardBlob() {
    const node = cardRef.current;
    if (!node) {
      throw new Error("Share card node not found.");
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const htmlToImage = await import("html-to-image");
    const dataUrl = await htmlToImage.toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });

    return dataUrlToBlob(dataUrl);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setActionMessage("링크 복사 완료");
    } catch {
      setActionMessage("링크 복사 실패");
    }
  }

  async function handleSaveImage() {
    try {
      setSharing(true);
      const blob = await createCardBlob();
      const fileName = `${slugifyFileName(resolvedTargetName)}-${typeof hops === "number" ? hops : "share"}-steps.png`;
      downloadBlob(blob, fileName);
      setActionMessage("공유 카드 이미지를 저장했습니다");
    } catch {
      setActionMessage("이미지 저장 실패");
    } finally {
      setSharing(false);
    }
  }

  async function handleSmartShare() {
    try {
      setSharing(true);

      const blob = await createCardBlob();
      const fileName = `${slugifyFileName(resolvedTargetName)}-${typeof hops === "number" ? hops : "share"}-steps.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      if (typeof nav.share === "function") {
        const fileShareData: ShareData = {
          title: shareTitle,
          text: shareText,
          url: fullShareUrl,
          files: [file],
        };

        if (typeof nav.canShare === "function" && nav.canShare(fileShareData)) {
          await nav.share(fileShareData);
          setActionMessage("공유창을 열었습니다");
          return;
        }

        await nav.share({
          title: shareTitle,
          text: shareText,
          url: fullShareUrl,
        });
        downloadBlob(blob, fileName);
        setActionMessage("공유창을 열고 이미지 파일도 저장했습니다");
        return;
      }

      downloadBlob(blob, fileName);
      await handleCopyLink();
      setActionMessage("공유창 미지원 환경이라 이미지 저장 + 링크 복사로 대체했습니다");
    } catch {
      setActionMessage("공유를 완료하지 못했습니다");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className={captureMode ? "px-0 py-0" : "mx-auto max-w-7xl px-4 py-8 sm:px-6"}>
        {!captureMode && (
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Dunbar Link
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                Share Card
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                공유 버튼을 누르면 카드를 이미지로 만들고, 가능한 환경에서는 바로 공유창을 엽니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/path?ownerUserId=${encodeURIComponent(ownerUserId)}&targetPid=${encodeURIComponent(
                  targetPid
                )}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Path
              </Link>
              <Link
                href="/my-network"
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Go My Network
              </Link>
            </div>
          </div>
        )}

        <div className={captureMode ? "p-0" : "grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]"}>
          <section
            ref={cardRef}
            className={
              captureMode
                ? "mx-auto w-full max-w-[430px] rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_28px_90px_rgba(15,23,42,0.16)]"
                : "rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.09)]"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Relationship Distance
                </p>
                <h2 className="mt-3 text-[24px] font-bold leading-[1.1] tracking-tight text-slate-950 sm:text-[28px]">
                  나는 <span className="break-words">{resolvedTargetName}</span>
                  <br />
                  까지 {hopsText}
                </h2>
              </div>

              <div className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                {getTargetBadge(targetCategory)}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {recScore ? (
                <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                  추천 점수 {recScore}
                </div>
              ) : null}

              {confidenceLabel ? (
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getConfidenceTone(
                    confidenceLabel
                  )}`}
                >
                  {confidenceLabel}
                  {confidenceValue ? ` · ${confidenceValue}` : ""}
                </div>
              ) : null}

              {typeof hops === "number" ? (
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {hops} hops
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: "Avg Trust", value: avgTrust },
                { label: "Bottleneck", value: bottleneckTrust },
                { label: "Coin Cost", value: cost },
                {
                  label: "Balance",
                  value:
                    balanceAfter !== null
                      ? String(balanceAfter)
                      : balanceBefore !== null
                      ? String(balanceBefore)
                      : "-",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </p>
                  <p className={`mt-2 text-xl font-bold ${statValueClass(item.value)}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-slate-950 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Presented Path
              </p>
              <p className="mt-2 text-sm leading-6 text-white break-words">
                {pathLine}
              </p>
            </div>

            {(recReason || recSourceHint) && (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                  Recommendation Context
                </p>
                {recReason ? (
                  <p className="mt-2 text-sm leading-6 text-slate-800 break-words">
                    {recReason}
                  </p>
                ) : null}
                {recSourceHint ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600 break-words">
                    {recSourceHint}
                  </p>
                ) : null}
              </div>
            )}

            {loading && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                공유 카드용 경로를 다시 불러오는 중입니다...
              </div>
            )}

            {!loading && errorMessage && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm font-semibold text-rose-700">경로 확인 안내</p>
                <p className="mt-2 text-sm leading-6 text-rose-700 break-words">
                  {errorMessage}
                </p>
              </div>
            )}

            {!loading && !errorMessage && found && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">공유 준비 완료</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">
                  이 카드 자체를 이미지로 만들어 공유하는 흐름을 기본 공유 방식으로 사용합니다.
                </p>
              </div>
            )}
          </section>

          {!captureMode && (
            <section className="space-y-4">
              <div className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.09)]">
                <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                  Smart Share
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  지원되는 모바일 환경에서는 공유 버튼 한 번으로 카드 이미지를 만들고 SNS 공유창을 엽니다. 지원이 약한 환경에서는 이미지 저장과 링크 복사로 자연스럽게 대체됩니다.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={handleSmartShare}
                    disabled={sharing || loading || !found}
                    className="rounded-3xl bg-slate-950 p-4 text-left text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <p className="text-lg font-bold tracking-tight">
                      {sharing ? "Preparing Share..." : "Share to SNS"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      카드 이미지를 생성하고 가능한 경우 바로 공유창을 엽니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveImage}
                    disabled={sharing || loading || !found}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <p className="text-lg font-bold tracking-tight text-slate-950">
                      Save Card Image
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      공유 카드 이미지를 PNG로 저장합니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:bg-slate-100"
                  >
                    <p className="text-lg font-bold tracking-tight text-slate-950">
                      Copy Share Link
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      캡처 모드 링크를 복사합니다.
                    </p>
                  </button>
                </div>

                {actionMessage ? (
                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                    {actionMessage}
                  </div>
                ) : null}

                <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">현재 제품 판단</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-base font-bold text-slate-950">지금 반영</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        모바일 중심 원클릭 공유 흐름
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-base font-bold text-slate-950">유지</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        이미지 저장 + 링크 복사 fallback
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-base font-bold text-slate-950">나중에</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        플랫폼별 deep link 최적화
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.09)]">
                <h3 className="text-2xl font-bold tracking-tight text-slate-950">
                  운영 확인 포인트
                </h3>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-lg font-bold tracking-tight text-slate-950">
                      capture link
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      아래 링크는 카드만 보이는 캡처용 링크입니다.
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-all rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                      {fullShareUrl}
                    </pre>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-lg font-bold tracking-tight text-slate-950">
                      코인 오류 대응
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      path discover는 코인을 소모합니다. 부족하면 지갑 충전 후 다시 열어야 합니다.
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
{`insert into dl_wallets (user_id, balance)
values ('${FIXED_OWNER_USER_ID}', 1000)
on conflict (user_id) do update
set balance = 1000;`}
                    </pre>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PathSharePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100">
          <div className="mx-auto flex min-h-[320px] max-w-4xl items-center justify-center px-4 py-8 text-sm text-slate-500">
            공유 경로를 불러오는 중...
          </div>
        </main>
      }
    >
      <PathSharePageContent />
    </Suspense>
  );
}
