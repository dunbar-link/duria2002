"use client";

import React from "react";

export type HomeMoveMenuLayerTarget = {
  layerKey: string;
  layerLabel: string;
  canSendHome: boolean;
  canSendMore: boolean;
};

type HomeMoveMenuProps = {
  open: boolean;
  personName: string;
  currentLayerLabel: string;
  targets: HomeMoveMenuLayerTarget[];
  onSendToCurrentHome: () => void;
  onSendToCurrentMore: () => void;
  onMoveToLayerHome: (layerKey: string) => void;
  onMoveToLayerMore: (layerKey: string) => void;
  onClose: () => void;
};

function ActionButton({
  label,
  sublabel,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "w-full rounded-2xl border px-4 py-3 text-left transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        primary
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-900",
      ].join(" ")}
    >
      <div className="text-[14px] font-semibold">{label}</div>
      {sublabel ? (
        <div className="mt-1 text-[12px] opacity-70">{sublabel}</div>
      ) : null}
    </button>
  );
}

export default function HomeMoveMenu({
  open,
  personName,
  currentLayerLabel,
  targets,
  onSendToCurrentHome,
  onSendToCurrentMore,
  onMoveToLayerHome,
  onMoveToLayerMore,
  onClose,
}: HomeMoveMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/28"
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[480px] px-4 pb-4">
        <div className="rounded-[28px] border border-neutral-200 bg-[#fbfaf7] p-4 shadow-2xl">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-300" />

          <div className="mb-4">
            <div className="text-[15px] font-semibold text-neutral-900">
              {personName}
            </div>
            <div className="mt-1 text-[12px] text-neutral-500">
              길게 눌러 이동 보조 메뉴를 열었어요
            </div>
          </div>

          <div className="space-y-2">
            <ActionButton
              label={`${currentLayerLabel} 홈으로 보내기`}
              sublabel="현재 레이어의 홈 visible 슬롯으로 이동"
              onClick={onSendToCurrentHome}
              primary
            />

            <ActionButton
              label={`${currentLayerLabel} 더보기로 보내기`}
              sublabel="현재 레이어의 +N 영역으로 이동"
              onClick={onSendToCurrentMore}
            />
          </div>

          <div className="my-4 h-px bg-neutral-200" />

          <div className="mb-2 text-[12px] font-semibold tracking-[-0.01em] text-neutral-500">
            다른 레이어로 이동
          </div>

          <div className="space-y-3">
            {targets.map((target) => (
              <div
                key={target.layerKey}
                className="rounded-2xl border border-neutral-200 bg-white p-3"
              >
                <div className="mb-2 text-[13px] font-semibold text-neutral-900">
                  {target.layerLabel}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    label="홈으로"
                    sublabel="visible 슬롯"
                    onClick={() => onMoveToLayerHome(target.layerKey)}
                    disabled={!target.canSendHome}
                  />

                  <ActionButton
                    label="더보기로"
                    sublabel="+N 슬롯"
                    onClick={() => onMoveToLayerMore(target.layerKey)}
                    disabled={!target.canSendMore}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[14px] font-medium text-neutral-700"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}