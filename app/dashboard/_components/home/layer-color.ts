export type LayerColor = {
  bg: string;
  text: string;
  border: string;
};

// Keys align with the canonical LayerId (DUNBAR-LABEL-001):
// family / core / intimate / trust / maintain. The previous "friendly" key
// was a dead alias — no code path stored "friendly" as a layerId, so
// LAYER_COLOR_MAP.friendly only ever served as an accidental fallback for
// the 150-tier layer whose real id is "maintain".
export const LAYER_COLOR_MAP: Record<string, LayerColor> = {
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
