import Link from "next/link";

export type ExploreTeaserItem = {
  id: string;
  name: string;
  hopsLabel: string;
  connectorLabel: string;
  avatarEmoji: string;
  targetPid: string;
  targetName: string;
  stepCount: number;
  score: number;
  sourceTag: string;
};

function ExploreTeaserCard({
  item,
}: {
  item: ExploreTeaserItem;
}) {
  return (
    <Link
      href={`/path/mobile?targetPid=${encodeURIComponent(
        item.targetPid,
      )}&targetName=${encodeURIComponent(item.targetName)}`}
      className="block rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(247,250,252,0.96)_100%)] px-[13px] py-[9px] shadow-[0_7px_18px_rgba(15,23,42,0.05)] transition-all duration-150 hover:-translate-y-[1px] active:scale-[0.99]"
    >
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-slate-200/90 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.95)_0%,rgba(226,232,240,0.95)_100%)] text-[21px] shadow-[0_5px_12px_rgba(15,23,42,0.06)]">
          {item.avatarEmoji}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[6px]">
            <span className="truncate text-[12px] font-semibold tracking-[-0.02em] text-slate-800">
              {item.name}
            </span>
            <span className="rounded-full bg-slate-100 px-[6px] py-[3px] text-[10px] font-semibold leading-none text-slate-500">
              {item.hopsLabel}
            </span>
          </div>

          <div className="mt-[4px] text-[10px] font-medium leading-[1.35] text-slate-500">
            {item.connectorLabel}
          </div>

          <div className="mt-[4px] text-[10px] font-medium leading-none text-slate-400">
            {item.sourceTag} 추천
          </div>
        </div>

        <div className="rounded-full border border-slate-200 bg-white px-[10px] py-[6px] text-[11px] font-semibold leading-none text-slate-600">
          보기
        </div>
      </div>
    </Link>
  );
}

export default function DashboardExploreTeaserStack({
  items,
  loading,
  errorText,
}: {
  items: ExploreTeaserItem[];
  loading: boolean;
  errorText: string;
}) {
  if (loading) {
    return (
      <div className="rounded-[20px] border border-slate-200/75 bg-white/85 px-[14px] py-[14px] text-[12px] font-medium text-slate-500 shadow-[0_7px_18px_rgba(15,23,42,0.04)]">
        연결 가능한 사람을 찾는 중이에요
      </div>
    );
  }

  if (items.length > 0) {
    return (
      <div className="space-y-[8px]">
        {items.map((item) => (
          <ExploreTeaserCard key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-slate-200/75 bg-white/85 px-[14px] py-[14px] shadow-[0_7px_18px_rgba(15,23,42,0.04)]">
      <div className="text-[12px] font-semibold text-slate-700">
        아직 추천 경로가 없어요
      </div>
      <div className="mt-[5px] text-[11px] leading-[1.55] text-slate-500">
        인맥을 더 입력하면
        <br />
        홈 추천 카드가 실제 경로 기반으로 채워져요
      </div>
      {errorText ? (
        <div className="mt-[8px] text-[10px] leading-[1.45] text-slate-400">
          {errorText}
        </div>
      ) : null}
    </div>
  );
}
