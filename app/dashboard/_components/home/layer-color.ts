export type LayerColor = {
  bg: string;
  text: string;
  border: string;
};

export const LAYER_COLOR_MAP: Record<string, LayerColor> = {
  friendly: {
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
  return LAYER_COLOR_MAP.friendly;
}
