"use client";

import { ReactNode } from "react";

type Props<TLayer> = {
  layers: TLayer[];
  renderLayer: (layer: TLayer) => ReactNode;
};

export default function HomeLayerSection<TLayer>({
  layers,
  renderLayer,
}: Props<TLayer>) {
  return <div className="space-y-[8px]">{layers.map(renderLayer)}</div>;

}