"use client";

import Link from "next/link";

type ExploreTeaserItem = {
  targetPid?: string;
  name?: string;
  stepCount?: number;
  score?: number;
  reachable?: boolean;
  imageUrl?: string;
  avatarEmoji?: string;
  targetName?: string;
  [key: string]: unknown;
};

type HomeRecommendationCardProps = {
  item: ExploreTeaserItem;
  size?: number;
  labelMaxWidth?: number;
};

function toText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function getDisplayName(item: ExploreTeaserItem) {
  return (
    toText(item.name) ||
    toText(item.targetName) ||
    "추천"
  );
}

function getInitial(name: string) {
  if (!name) return "?";
  return name.slice(0, 1).toUpperCase();
}

function getStepLabel(stepCount: unknown) {
  if (typeof stepCount !== "number" || stepCount <= 0) return "-";
  return `${stepCount}단계`;
}

function buildPathHref(item: ExploreTeaserItem) {
  const pid = toText(item.targetPid);
  const name = getDisplayName(item);

  if (!pid) return "";

  const params = new URLSearchParams();
  params.set("targetPid", pid);
  params.set("targetName", name);

  return `/path?${params.toString()}`;
}

function CardBody({
  item,
  size = 56,
  labelMaxWidth = 58,
}: {
  item: ExploreTeaserItem;
  size?: number;
  labelMaxWidth?: number;
}) {
  const name = getDisplayName(item);
  const reachable = item.reachable !== false;
  const stepLabel = getStepLabel(item.stepCount);

  return (
    <div className="flex shrink-0 flex-col items-center text-center"
      style={{ width: size }}>
      
      <div className="relative">

        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className={reachable
              ? "rounded-[18px] border border-slate-300 object-cover"
              : "rounded-[18px] border border-slate-200 opacity-60"
            }
            style={{ width: size, height: size }}
          />
        ) : (
          <div
            className={reachable
              ? "flex items-center justify-center rounded-[18px] border border-[#B9C8DB] bg-[#EEF4FB] text-[24px]"
              : "flex items-center justify-center rounded-[18px] border border-slate-200 bg-[#F1F3F5] text-[22px] text-slate-400"
            }
            style={{ width: size, height: size }}
          >
            {toText(item.avatarEmoji) || getInitial(name)}
          </div>
        )}

        {/* 단계 표시 */}
        <div
          className={reachable
            ? "absolute -right-[3px] -top-[3px] rounded-full bg-[#EEF6FF] px-[5px] py-[2px] text-[8px]"
            : "absolute -right-[3px] -top-[3px] rounded-full bg-slate-100 px-[5px] py-[2px] text-[8px]"
          }
        >
          {stepLabel}
        </div>

        {/* 연결 가능 점 */}
        {reachable && (
          <span className="absolute -bottom-[1px] left-1/2 h-[8px] w-[8px] -translate-x-1/2 rounded-full bg-[#7EA1C4]" />
        )}

      </div>

      {/* 이름 */}
      <span
        className={reachable
          ? "mt-[6px] truncate text-[10px] text-slate-600"
          : "mt-[6px] truncate text-[10px] text-slate-400"
        }
        style={{ maxWidth: labelMaxWidth }}
      >
        {name}
      </span>
    </div>
  );
}

export default function HomeRecommendationCard({
  item,
  size = 56,
  labelMaxWidth = 58,
}: HomeRecommendationCardProps) {

  const href = buildPathHref(item);

  if (!href) {
    return <CardBody item={item} size={size} labelMaxWidth={labelMaxWidth} />;
  }

  return (
    <Link
      href={href}
      className="block transition hover:scale-[1.03] active:scale-[0.97]"
    >
      <CardBody item={item} size={size} labelMaxWidth={labelMaxWidth} />
    </Link>
  );
}