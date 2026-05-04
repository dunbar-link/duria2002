"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

type ShareablePathResultCardProps = {
  targetName: string;
  hops: number;
  confidence: number;
  confidenceLabel?: string;
  cost?: number | null;
  balanceAfter?: number | null;
  presentedPath: string;
};

type ExportVariant = "feed" | "square" | "story";

function getFallbackConfidenceLabel(confidence: number) {
  if (confidence >= 85) return "Elite Path";
  if (confidence >= 70) return "Strong Path";
  if (confidence >= 50) return "Emerging Path";
  return "Weak Signal";
}

function getResultCopy(confidence: number, hops: number) {
  if (confidence >= 85 && hops <= 2) {
    return "High-trust route discovered";
  }
  if (confidence >= 70) {
    return "Verified relationship path";
  }
  if (confidence >= 50) {
    return "Promising connection route";
  }
  return "Low-confidence discovery route";
}

function getChallengeCopy(hops: number) {
  if (hops <= 2) return "너는 누구까지 2단계 안에 연결되어 있을까?";
  if (hops <= 4) return "너는 누구까지 연결되어 있을까?";
  return "너의 숨은 연결 경로를 찾아보세요.";
}

function splitPath(presentedPath: string) {
  return presentedPath
    .split("→")
    .map((item) => item.trim())
    .filter(Boolean);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .toLowerCase();
}

function truncateNodeLabel(label: string, maxLength: number) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

function buildResponsivePathNodes(pathNodes: string[]) {
  return pathNodes.map((node) => truncateNodeLabel(node, 24));
}

function buildCompactPathNodes(pathNodes: string[]) {
  if (pathNodes.length <= 4) {
    return pathNodes.map((node) => truncateNodeLabel(node, 20));
  }

  const first = pathNodes[0];
  const second = pathNodes[1];
  const last = pathNodes[pathNodes.length - 1];
  const hiddenCount = pathNodes.length - 3;

  return [
    truncateNodeLabel(first, 16),
    truncateNodeLabel(second, 18),
    `+${hiddenCount}`,
    truncateNodeLabel(last, 18),
  ];
}

const BRAND = {
  accent: "#4F46E5",
  accentSoft: "#EEF2FF",
  accentBorder: "#C7D2FE",
  accentText: "#3730A3",
};

type PathPillsProps = {
  pathNodes: string[];
  size?: "sm" | "md" | "lg";
};

function PathPills({ pathNodes, size = "md" }: PathPillsProps) {
  if (pathNodes.length === 0) {
    return (
      <div
        className={
          size === "lg" ? "text-xl text-neutral-500" : "text-sm text-neutral-500"
        }
      >
        경로를 찾지 못했습니다.
      </div>
    );
  }

  const containerClass =
    size === "lg"
      ? "flex flex-wrap items-center gap-3 overflow-hidden"
      : "flex flex-wrap items-center gap-2 overflow-hidden";

  const arrowClass =
    size === "lg" ? "px-1 text-3xl text-neutral-400" : "px-1 text-lg text-neutral-400";

  return (
    <div className={containerClass}>
      {pathNodes.map((node, index) => {
        const isCountBadge = node.startsWith("+") && /^\+\d+$/.test(node);

        const pillClass =
          size === "lg"
            ? isCountBadge
              ? "max-w-full whitespace-nowrap rounded-full px-5 py-3 text-2xl font-semibold text-white"
              : "max-w-full whitespace-nowrap rounded-full border px-5 py-3 text-2xl font-medium text-neutral-900"
            : isCountBadge
              ? "max-w-full whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-white md:text-base"
              : "max-w-full whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium text-neutral-900 md:text-base";

        return (
          <div key={`${node}-${index}`} className="contents">
            <span
              className={pillClass}
              style={
                isCountBadge
                  ? {
                      backgroundColor: BRAND.accent,
                      borderColor: BRAND.accent,
                    }
                  : {
                      backgroundColor: "#F8FAFC",
                      borderColor: "#E5E7EB",
                    }
              }
              title={isCountBadge ? "Hidden middle nodes" : node}
            >
              {node}
            </span>

            {index < pathNodes.length - 1 && <span className={arrowClass}>→</span>}
          </div>
        );
      })}
    </div>
  );
}

type ConfidenceBadgeProps = {
  confidence: number;
  label: string;
  large?: boolean;
};

function ConfidenceBadge({
  confidence,
  label,
  large = false,
}: ConfidenceBadgeProps) {
  let bg = BRAND.accentSoft;
  let border = BRAND.accentBorder;
  let text = BRAND.accentText;

  if (confidence < 70) {
    bg = "#F3F4F6";
    border = "#D1D5DB";
    text = "#374151";
  }

  const className = large
    ? "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-lg font-semibold leading-none"
    : "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold leading-none md:text-sm";

  return (
    <span
      className={className}
      style={{
        backgroundColor: bg,
        borderColor: border,
        color: text,
      }}
      title={label}
    >
      {label}
    </span>
  );
}

type BaseCardProps = {
  targetName: string;
  hops: number;
  confidence: number;
  confidenceLabel: string;
  resultCopy: string;
  challengeCopy: string;
  cost?: number | null;
  balanceAfter?: number | null;
  pathNodes: string[];
};

function ResponsiveCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  resultCopy,
  challengeCopy,
  cost,
  balanceAfter,
  pathNodes,
}: BaseCardProps) {
  const headlineTop = `나는 ${targetName}까지`;
  const headlineBottom = `${hops}단계입니다`;

  return (
    <div
      className="relative overflow-hidden rounded-[32px] border p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] md:p-10"
      style={{
        borderColor: "#E5E7EB",
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 58%, #EEF2FF 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(79, 70, 229, 0.12)" }}
        />
        <div
          className="absolute -left-10 bottom-0 h-40 w-40 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(99, 102, 241, 0.10)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ backgroundColor: BRAND.accent }}
        />
      </div>

      <div className="relative">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl min-w-0">
            <div
              className="text-xs font-semibold uppercase tracking-[0.32em]"
              style={{ color: BRAND.accentText }}
            >
              Dunbar Link
            </div>

            <div className="mt-5 space-y-2">
              <div className="text-lg font-medium leading-tight text-neutral-700 md:text-2xl">
                {headlineTop}
              </div>
              <div className="text-4xl font-black leading-none tracking-tight text-neutral-950 md:text-6xl">
                {headlineBottom}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ConfidenceBadge confidence={confidence} label={confidenceLabel} />
              <div
                className="inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold md:text-sm"
                style={{
                  backgroundColor: "rgba(255,255,255,0.92)",
                  borderColor: BRAND.accentBorder,
                  color: BRAND.accentText,
                }}
              >
                {resultCopy}
              </div>
            </div>

            <div
              className="mt-4 rounded-[20px] border px-4 py-3 text-sm font-semibold leading-relaxed md:text-base"
              style={{
                borderColor: BRAND.accentBorder,
                backgroundColor: "rgba(255,255,255,0.92)",
                color: BRAND.accentText,
              }}
            >
              {challengeCopy}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:w-[260px] md:grid-cols-1">
            <div className="rounded-3xl border border-neutral-200 bg-white/95 p-4 shadow-sm">
              <div
                className="text-xs uppercase tracking-[0.16em]"
                style={{ color: BRAND.accentText }}
              >
                Distance
              </div>
              <div className="mt-2 text-3xl font-black leading-none text-neutral-950">
                {hops}
              </div>
              <div className="mt-1 text-sm text-neutral-600">hops</div>
            </div>

            <div
              className="rounded-3xl border p-4 shadow-sm"
              style={{
                borderColor: BRAND.accentBorder,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,242,255,0.92) 100%)",
              }}
            >
              <div
                className="text-xs uppercase tracking-[0.16em]"
                style={{ color: BRAND.accentText }}
              >
                Confidence
              </div>
              <div className="mt-2 text-3xl font-black leading-none text-neutral-950">
                {confidence}%
              </div>
              <div className="mt-1 text-sm" style={{ color: BRAND.accentText }}>
                {confidenceLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-neutral-200 bg-white/95 p-5 shadow-sm">
            <div
              className="text-xs uppercase tracking-[0.16em]"
              style={{ color: BRAND.accentText }}
            >
              Cost
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-black leading-none text-neutral-950">
                {cost != null ? cost : "-"}
              </span>
              <span className="text-sm text-neutral-600">coins</span>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white/95 p-5 shadow-sm">
            <div
              className="text-xs uppercase tracking-[0.16em]"
              style={{ color: BRAND.accentText }}
            >
              Balance
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-black leading-none text-neutral-950">
                {balanceAfter != null ? balanceAfter : "-"}
              </span>
              <span className="text-sm text-neutral-600">coins</span>
            </div>
          </div>
        </div>

        <div
          className="mt-6 overflow-hidden rounded-[28px] border bg-white/95 p-5 shadow-sm"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="text-xs font-semibold uppercase tracking-[0.28em]"
              style={{ color: BRAND.accentText }}
            >
              Trust Path
            </div>
            <div className="text-xs text-neutral-500">{pathNodes.length} nodes</div>
          </div>

          <div className="mt-4">
            <PathPills pathNodes={pathNodes} />
          </div>
        </div>

        <div
          className="mt-6 flex items-end justify-between gap-4 border-t pt-5"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div>
            <div className="text-sm font-semibold text-neutral-900">
              Dunbar Link
            </div>
            <div
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Relationship Distance Discovery
            </div>
          </div>

          <div className="text-right">
            <div
              className="text-xs uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Result
            </div>
            <div className="text-sm font-semibold text-neutral-900">
              {targetName} · {hops} hops
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  resultCopy,
  challengeCopy,
  cost,
  balanceAfter,
  pathNodes,
}: BaseCardProps) {
  const headlineTop = `나는 ${targetName}까지`;
  const headlineBottom = `${hops}단계입니다`;

  return (
    <div
      className="relative w-[1000px] overflow-hidden rounded-[40px] border shadow-[0_16px_48px_rgba(0,0,0,0.10)]"
      style={{
        aspectRatio: "4 / 5",
        borderColor: "#E5E7EB",
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 52%, #EEF2FF 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(79, 70, 229, 0.15)" }}
        />
        <div
          className="absolute -left-16 bottom-10 h-64 w-64 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(99, 102, 241, 0.12)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-2"
          style={{ backgroundColor: BRAND.accent }}
        />
      </div>

      <div className="relative flex h-full flex-col p-12">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-[560px] min-w-0">
            <div
              className="text-sm font-semibold uppercase tracking-[0.38em]"
              style={{ color: BRAND.accentText }}
            >
              Dunbar Link
            </div>

            <div className="mt-8 text-[42px] font-medium leading-tight text-neutral-700">
              {headlineTop}
            </div>

            <div className="mt-3 text-[88px] font-black leading-[0.95] tracking-tight text-neutral-950">
              {headlineBottom}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ConfidenceBadge confidence={confidence} label={confidenceLabel} large />
              <div
                className="inline-flex items-center rounded-full border px-4 py-2 text-lg font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.92)",
                  borderColor: BRAND.accentBorder,
                  color: BRAND.accentText,
                }}
              >
                {resultCopy}
              </div>
            </div>

            <div
              className="mt-7 rounded-[24px] border px-5 py-4 text-xl font-semibold leading-relaxed shadow-sm"
              style={{
                borderColor: BRAND.accentBorder,
                backgroundColor: "rgba(255,255,255,0.92)",
                color: BRAND.accentText,
              }}
            >
              {challengeCopy}
            </div>
          </div>

          <div className="flex w-[250px] flex-col gap-4">
            <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-sm">
              <div
                className="text-sm uppercase tracking-[0.18em]"
                style={{ color: BRAND.accentText }}
              >
                Distance
              </div>
              <div className="mt-3 text-6xl font-black leading-none text-neutral-950">
                {hops}
              </div>
              <div className="mt-2 text-xl text-neutral-600">hops</div>
            </div>

            <div
              className="rounded-[28px] border p-6 shadow-sm"
              style={{
                borderColor: BRAND.accentBorder,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,242,255,0.92) 100%)",
              }}
            >
              <div
                className="text-sm uppercase tracking-[0.18em]"
                style={{ color: BRAND.accentText }}
              >
                Confidence
              </div>
              <div className="mt-3 text-6xl font-black leading-none text-neutral-950">
                {confidence}%
              </div>
              <div className="mt-2 text-xl" style={{ color: BRAND.accentText }}>
                {confidenceLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-sm">
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Cost
            </div>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-5xl font-black leading-none text-neutral-950">
                {cost != null ? cost : "-"}
              </span>
              <span className="pb-1 text-xl text-neutral-600">coins</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-sm">
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Balance
            </div>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-5xl font-black leading-none text-neutral-950">
                {balanceAfter != null ? balanceAfter : "-"}
              </span>
              <span className="pb-1 text-xl text-neutral-600">coins</span>
            </div>
          </div>
        </div>

        <div
          className="mt-6 overflow-hidden rounded-[28px] border bg-white/95 p-6 shadow-sm"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="text-sm font-semibold uppercase tracking-[0.32em]"
              style={{ color: BRAND.accentText }}
            >
              Trust Path
            </div>
            <div className="text-sm text-neutral-500">{pathNodes.length} nodes</div>
          </div>

          <div className="mt-5">
            <PathPills pathNodes={pathNodes} size="lg" />
          </div>
        </div>

        <div
          className="mt-auto flex items-end justify-between gap-6 border-t pt-8"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div>
            <div className="text-2xl font-semibold text-neutral-900">Dunbar Link</div>
            <div
              className="mt-1 text-sm uppercase tracking-[0.28em]"
              style={{ color: BRAND.accentText }}
            >
              Relationship Distance Discovery
            </div>
          </div>

          <div className="text-right">
            <div
              className="text-sm uppercase tracking-[0.22em]"
              style={{ color: BRAND.accentText }}
            >
              Result
            </div>
            <div className="mt-2 text-2xl font-semibold text-neutral-900">
              {targetName} · {hops} hops
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SquareCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  resultCopy,
  challengeCopy,
  pathNodes,
}: BaseCardProps) {
  const headlineTop = `나는 ${targetName}까지`;
  const headlineBottom = `${hops}단계입니다`;

  return (
    <div
      className="relative w-[1080px] overflow-hidden rounded-[44px] border shadow-[0_16px_48px_rgba(0,0,0,0.10)]"
      style={{
        aspectRatio: "1 / 1",
        borderColor: "#E5E7EB",
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 52%, #EEF2FF 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(79, 70, 229, 0.15)" }}
        />
        <div
          className="absolute -left-16 bottom-10 h-64 w-64 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(99, 102, 241, 0.12)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-2"
          style={{ backgroundColor: BRAND.accent }}
        />
      </div>

      <div className="relative flex h-full flex-col p-14">
        <div
          className="text-sm font-semibold uppercase tracking-[0.38em]"
          style={{ color: BRAND.accentText }}
        >
          Dunbar Link
        </div>

        <div className="mt-10 text-[44px] font-medium leading-tight text-neutral-700">
          {headlineTop}
        </div>
        <div className="mt-3 text-[86px] font-black leading-[0.95] tracking-tight text-neutral-950">
          {headlineBottom}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ConfidenceBadge confidence={confidence} label={confidenceLabel} large />
          <div
            className="inline-flex items-center rounded-full border px-4 py-2 text-lg font-medium"
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              borderColor: BRAND.accentBorder,
              color: BRAND.accentText,
            }}
          >
            {resultCopy}
          </div>
        </div>

        <div
          className="mt-6 rounded-[24px] border px-5 py-4 text-xl font-semibold leading-relaxed"
          style={{
            borderColor: BRAND.accentBorder,
            backgroundColor: "rgba(255,255,255,0.92)",
            color: BRAND.accentText,
          }}
        >
          {challengeCopy}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-sm">
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Distance
            </div>
            <div className="mt-3 text-5xl font-black leading-none text-neutral-950">
              {hops}
            </div>
            <div className="mt-2 text-lg text-neutral-600">hops</div>
          </div>

          <div
            className="rounded-[28px] border p-6 shadow-sm"
            style={{
              borderColor: BRAND.accentBorder,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,242,255,0.92) 100%)",
            }}
          >
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Confidence
            </div>
            <div className="mt-3 text-5xl font-black leading-none text-neutral-950">
              {confidence}%
            </div>
            <div className="mt-2 text-lg" style={{ color: BRAND.accentText }}>
              {confidenceLabel}
            </div>
          </div>
        </div>

        <div
          className="mt-8 overflow-hidden rounded-[28px] border bg-white/95 p-6 shadow-sm"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="text-sm font-semibold uppercase tracking-[0.32em]"
              style={{ color: BRAND.accentText }}
            >
              Trust Path
            </div>
            <div className="text-sm text-neutral-500">{pathNodes.length} nodes</div>
          </div>

          <div className="mt-5">
            <PathPills pathNodes={pathNodes} size="lg" />
          </div>
        </div>

        <div
          className="mt-auto flex items-end justify-between gap-6 border-t pt-8"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div>
            <div className="text-2xl font-semibold text-neutral-900">Dunbar Link</div>
            <div
              className="mt-1 text-sm uppercase tracking-[0.28em]"
              style={{ color: BRAND.accentText }}
            >
              Relationship Distance Discovery
            </div>
          </div>

          <div className="text-right">
            <div
              className="text-sm uppercase tracking-[0.22em]"
              style={{ color: BRAND.accentText }}
            >
              Result
            </div>
            <div className="mt-2 text-2xl font-semibold text-neutral-900">
              {targetName} · {hops} hops
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  resultCopy,
  challengeCopy,
  pathNodes,
}: BaseCardProps) {
  const headlineTop = `나는 ${targetName}까지`;
  const headlineBottom = `${hops}단계입니다`;

  return (
    <div
      className="relative w-[1080px] overflow-hidden rounded-[44px] border shadow-[0_16px_48px_rgba(0,0,0,0.10)]"
      style={{
        aspectRatio: "9 / 16",
        borderColor: "#E5E7EB",
        background:
          "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 42%, #EEF2FF 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -right-10 top-20 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(79, 70, 229, 0.16)" }}
        />
        <div
          className="absolute -left-16 bottom-24 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(99, 102, 241, 0.12)" }}
        />
        <div
          className="absolute inset-x-0 top-0 h-3"
          style={{ backgroundColor: BRAND.accent }}
        />
      </div>

      <div className="relative flex h-full flex-col p-14">
        <div
          className="text-sm font-semibold uppercase tracking-[0.38em]"
          style={{ color: BRAND.accentText }}
        >
          Dunbar Link
        </div>

        <div className="mt-12 text-[42px] font-medium leading-tight text-neutral-700">
          {headlineTop}
        </div>
        <div className="mt-4 text-[96px] font-black leading-[0.92] tracking-tight text-neutral-950">
          {headlineBottom}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ConfidenceBadge confidence={confidence} label={confidenceLabel} large />
        </div>

        <div
          className="mt-5 rounded-[24px] border px-5 py-4 text-xl font-semibold leading-relaxed"
          style={{
            borderColor: BRAND.accentBorder,
            backgroundColor: "rgba(255,255,255,0.92)",
            color: BRAND.accentText,
          }}
        >
          {resultCopy}
        </div>

        <div
          className="mt-5 rounded-[24px] border px-5 py-4 text-2xl font-semibold leading-relaxed"
          style={{
            borderColor: BRAND.accentBorder,
            backgroundColor: "rgba(255,255,255,0.92)",
            color: BRAND.accentText,
          }}
        >
          {challengeCopy}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-[28px] border border-neutral-200 bg-white/95 p-6 shadow-sm">
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Distance
            </div>
            <div className="mt-3 text-5xl font-black leading-none text-neutral-950">
              {hops}
            </div>
            <div className="mt-2 text-lg text-neutral-600">hops</div>
          </div>

          <div
            className="rounded-[28px] border p-6 shadow-sm"
            style={{
              borderColor: BRAND.accentBorder,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(238,242,255,0.92) 100%)",
            }}
          >
            <div
              className="text-sm uppercase tracking-[0.18em]"
              style={{ color: BRAND.accentText }}
            >
              Confidence
            </div>
            <div className="mt-3 text-5xl font-black leading-none text-neutral-950">
              {confidence}%
            </div>
            <div className="mt-2 text-lg" style={{ color: BRAND.accentText }}>
              {confidenceLabel}
            </div>
          </div>
        </div>

        <div
          className="mt-8 overflow-hidden rounded-[28px] border bg-white/95 p-6 shadow-sm"
          style={{ borderColor: BRAND.accentBorder }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="text-sm font-semibold uppercase tracking-[0.32em]"
              style={{ color: BRAND.accentText }}
            >
              Trust Path
            </div>
            <div className="text-sm text-neutral-500">{pathNodes.length} nodes</div>
          </div>

          <div className="mt-5">
            <PathPills pathNodes={pathNodes} size="lg" />
          </div>
        </div>

        <div className="mt-auto">
          <div
            className="rounded-[28px] border bg-white/90 px-6 py-5"
            style={{ borderColor: BRAND.accentBorder }}
          >
            <div className="text-3xl font-semibold text-neutral-900">Dunbar Link</div>
            <div
              className="mt-2 text-base uppercase tracking-[0.24em]"
              style={{ color: BRAND.accentText }}
            >
              Relationship Distance Discovery
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShareablePathResultCard({
  targetName,
  hops,
  confidence,
  confidenceLabel,
  cost,
  balanceAfter,
  presentedPath,
}: ShareablePathResultCardProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const squareRef = useRef<HTMLDivElement | null>(null);
  const storyRef = useRef<HTMLDivElement | null>(null);

  const [savingVariant, setSavingVariant] = useState<ExportVariant | null>(null);

  const resolvedConfidenceLabel =
    confidenceLabel ?? getFallbackConfidenceLabel(confidence);
  const resultCopy = getResultCopy(confidence, hops);
  const challengeCopy = getChallengeCopy(hops);

  const rawPathNodes = useMemo(() => splitPath(presentedPath), [presentedPath]);

  const responsivePathNodes = useMemo(() => {
    return buildResponsivePathNodes(rawPathNodes);
  }, [rawPathNodes]);

  const compactPathNodes = useMemo(() => {
    return buildCompactPathNodes(rawPathNodes);
  }, [rawPathNodes]);

  const shareText = [
    `나는 ${targetName}까지 ${hops}단계입니다.`,
    challengeCopy,
    "",
    `Confidence: ${confidence}% (${resolvedConfidenceLabel})`,
    `Path: ${presentedPath}`,
    `Result: ${resultCopy}`,
    cost != null ? `Cost: ${cost} coins` : null,
    balanceAfter != null ? `Balance: ${balanceAfter} coins` : null,
    "",
    "Dunbar Link",
    "Discover your social distance",
  ]
    .filter(Boolean)
    .join("\n");

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      alert("공유 문구가 복사되었습니다.");
    } catch {
      alert("복사에 실패했습니다.");
    }
  }

  async function onShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Dunbar Link Result",
          text: shareText,
        });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      alert("공유 기능이 지원되지 않아 문구를 클립보드에 복사했습니다.");
    } catch {
      alert("공유에 실패했습니다.");
    }
  }

  function getVariantRef(variant: ExportVariant) {
    if (variant === "feed") return feedRef;
    if (variant === "square") return squareRef;
    return storyRef;
  }

  function getVariantFilenameSuffix(variant: ExportVariant) {
    if (variant === "feed") return "4x5";
    if (variant === "square") return "1x1";
    return "9x16";
  }

  async function onSaveVariant(variant: ExportVariant) {
    const ref = getVariantRef(variant);

    if (!ref.current) {
      alert("저장할 카드 영역을 찾지 못했습니다.");
      return;
    }

    try {
      setSavingVariant(variant);

      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#F5F7FF",
      });

      const safeTargetName = sanitizeFileName(targetName || "target");
      const filename = `dunbar-link-${safeTargetName}-${hops}-hops-${getVariantFilenameSuffix(
        variant
      )}.png`;

      downloadDataUrl(filename, dataUrl);
    } catch (error) {
      console.error(error);
      alert("PNG 저장에 실패했습니다.");
    } finally {
      setSavingVariant(null);
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Shareable Result Card</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-50"
          >
            Copy Text
          </button>

          <button
            type="button"
            onClick={() => onSaveVariant("feed")}
            disabled={savingVariant !== null}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingVariant === "feed" ? "Saving..." : "Save 4:5"}
          </button>

          <button
            type="button"
            onClick={() => onSaveVariant("square")}
            disabled={savingVariant !== null}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingVariant === "square" ? "Saving..." : "Save 1:1"}
          </button>

          <button
            type="button"
            onClick={() => onSaveVariant("story")}
            disabled={savingVariant !== null}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingVariant === "story" ? "Saving..." : "Save Story"}
          </button>

          <button
            type="button"
            onClick={onShare}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND.accent }}
          >
            Share
          </button>
        </div>
      </div>

      <div className="rounded-[32px] border border-neutral-200 bg-white p-4 shadow-sm md:p-6">
        <ResponsiveCard
          targetName={targetName}
          hops={hops}
          confidence={confidence}
          confidenceLabel={resolvedConfidenceLabel}
          resultCopy={resultCopy}
          challengeCopy={challengeCopy}
          cost={cost}
          balanceAfter={balanceAfter}
          pathNodes={responsivePathNodes}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-99999px] top-0 opacity-0"
      >
        <div ref={feedRef}>
          <FeedCard
            targetName={targetName}
            hops={hops}
            confidence={confidence}
            confidenceLabel={resolvedConfidenceLabel}
            resultCopy={resultCopy}
            challengeCopy={challengeCopy}
            cost={cost}
            balanceAfter={balanceAfter}
            pathNodes={compactPathNodes}
          />
        </div>

        <div ref={squareRef}>
          <SquareCard
            targetName={targetName}
            hops={hops}
            confidence={confidence}
            confidenceLabel={resolvedConfidenceLabel}
            resultCopy={resultCopy}
            challengeCopy={challengeCopy}
            cost={cost}
            balanceAfter={balanceAfter}
            pathNodes={compactPathNodes}
          />
        </div>

        <div ref={storyRef}>
          <StoryCard
            targetName={targetName}
            hops={hops}
            confidence={confidence}
            confidenceLabel={resolvedConfidenceLabel}
            resultCopy={resultCopy}
            challengeCopy={challengeCopy}
            cost={cost}
            balanceAfter={balanceAfter}
            pathNodes={compactPathNodes}
          />
        </div>
      </div>
    </section>
  );
}