export function calculateConfidenceV2(params: {
  hops: number;
  sumTrust: number;
  bottleneckTrust: number;
}) {
  const { hops, sumTrust, bottleneckTrust } = params;

  const avgTrust = hops > 0 ? sumTrust / hops : 0;
  const hopPenalty = Math.max(0, hops - 1) * 6;

  const rawScore =
    bottleneckTrust * 0.55 +
    avgTrust * 0.45 -
    hopPenalty;

  const confidence = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    confidence,
    avgTrust: Math.round(avgTrust),
    hopPenalty,
    rawScore: Math.round(rawScore * 100) / 100,
  };
}

export function getConfidenceLabel(confidence: number) {
  if (confidence >= 80) return "Strong Path";
  if (confidence >= 60) return "Good Path";
  if (confidence >= 40) return "Possible Path";
  if (confidence >= 20) return "Weak Path";
  return "Fragile Path";
}