import type { LayerId } from "./home-page-types";

export type LayerColor = {
  bg: string;
  text: string;
  border: string;
};

// Keyed by the canonical LayerId (DUNBAR-LABEL-001/003):
// family / core / intimate / trust / maintain. Record<LayerId, LayerColor>
// makes this exhaustive at compile time — a missing tier or a reintroduced
// dead alias (e.g. "friendly") is now a type error, not a silent fallback.
export const LAYER_COLOR_MAP: Record<LayerId, LayerColor> = {
  maintain: {
    bg: "#DDF7EE",
    text: "#0B7A5D",
    border: "#8EE5CA",
  },
  intimate: {
    bg: "#E0EFFD",
    text: "#1467B3",
    border: "#9FCCF7",
  },
  trust: {
    bg: "#FCE8C9",
    text: "#936018",
    border: "#F7B95C",
  },
  core: {
    bg: "#FAE0D8",
    text: "#A74726",
    border: "#F2A892",
  },
  family: {
    bg: "#EFE7FA",
    text: "#5B3A8E",
    border: "#CDB7EE",
  },
};

export function getLayerColor(layerId: string): LayerColor {
  if (layerId === "family") return LAYER_COLOR_MAP.family;
  if (layerId === "core") return LAYER_COLOR_MAP.core;
  if (layerId === "trust") return LAYER_COLOR_MAP.trust;
  if (layerId === "intimate") return LAYER_COLOR_MAP.intimate;
  return LAYER_COLOR_MAP.maintain;
}
