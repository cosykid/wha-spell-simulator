import { GLYPH_WARNINGS } from "../parser/glyphWarnings.js";
import { clamp, mean } from "../utils/geometry.js";

const QUALITY_TUNING = {
  ringQuality: 0.25,
  primaryConfidence: 0.25,
  signConfidence: 0.2,
  signFallbackPrimaryConfidence: 0.7,
  globalNeatness: 0.15,
  radialSymmetry: 0.1,
  insideScore: 0.05,
  unknownSoftLimit: 7
};

const STABILITY_TUNING = {
  ringNeatness: 0.36,
  symbolNeatness: 0.34,
  symbolNeatnessFallback: 0.35,
  radialSymmetry: 0.12,
  radialSymmetryFallback: 0.4,
  inverseInstability: 0.18,
  instabilityFallback: 0.5,
  unknownPenaltyMax: 0.34,
  unknownPenaltyScale: 0.24,
  ambiguityGrace: 0.14,
  boundaryPenalty: 0.08,
  centerPenalty: 0.16
};

function topMatchCompetitorConfidence(recognition) {
  return (
    recognition?.diagnostics?.topMatches?.find((score) => score.kind !== recognition.kind || score.id !== recognition.id)
      ?.confidence ??
    0
  );
}

export function calculateSpellQuality(glyphAST) {
  const ringQuality = glyphAST.ring?.neatness ?? 0;
  const primaryConfidence = glyphAST.primarySigil?.confidence ?? 0;
  const signConfidence = mean((glyphAST.signs ?? []).map((sign) => sign.confidence));
  const globalNeatness = glyphAST.globalMetrics?.neatness ?? 0;
  const symmetry = glyphAST.globalMetrics?.radialSymmetry ?? 0;
  const insideScore = 1 - Math.min(1, (glyphAST.unknowns?.length ?? 0) / QUALITY_TUNING.unknownSoftLimit);

  return clamp(
    ringQuality * QUALITY_TUNING.ringQuality +
      primaryConfidence * QUALITY_TUNING.primaryConfidence +
      (signConfidence || primaryConfidence * QUALITY_TUNING.signFallbackPrimaryConfidence) *
        QUALITY_TUNING.signConfidence +
      globalNeatness * QUALITY_TUNING.globalNeatness +
      symmetry * QUALITY_TUNING.radialSymmetry +
      insideScore * QUALITY_TUNING.insideScore
  );
}

export function calculateSpellStability(glyphAST, config) {
  const ringNeatness = glyphAST.ring?.neatness ?? 0;
  const symbolNeatness = mean([
    glyphAST.primarySigil?.neatness ?? 0,
    ...(glyphAST.signs ?? []).map((sign) => sign.neatness)
  ].filter(Boolean));
  const unknownPenalty = Math.min(
    STABILITY_TUNING.unknownPenaltyMax,
    ((glyphAST.unknowns?.length ?? 0) / config.compiler.maxUnknownsBeforeInstability) *
      STABILITY_TUNING.unknownPenaltyScale
  );
  const ambiguityPenalty = Math.max(
    0,
    topMatchCompetitorConfidence(glyphAST.primarySigil) -
      (glyphAST.primarySigil?.confidence ?? 0) +
      STABILITY_TUNING.ambiguityGrace
  );
  const boundaryPenalty = (glyphAST.warnings ?? []).includes(GLYPH_WARNINGS.symbolNearLayerBoundary)
    ? STABILITY_TUNING.boundaryPenalty
    : 0;
  const centerPenalty = (glyphAST.warnings ?? []).includes(GLYPH_WARNINGS.centerUnknownContamination)
    ? STABILITY_TUNING.centerPenalty
    : 0;
  const inverseInstability = 1 - (glyphAST.globalMetrics?.instability ?? STABILITY_TUNING.instabilityFallback);

  return clamp(
    ringNeatness * STABILITY_TUNING.ringNeatness +
      (symbolNeatness || STABILITY_TUNING.symbolNeatnessFallback) * STABILITY_TUNING.symbolNeatness +
      (glyphAST.globalMetrics?.radialSymmetry ?? STABILITY_TUNING.radialSymmetryFallback) *
        STABILITY_TUNING.radialSymmetry +
      inverseInstability * STABILITY_TUNING.inverseInstability -
      unknownPenalty -
      ambiguityPenalty -
      boundaryPenalty -
      centerPenalty
  );
}
