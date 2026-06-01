import {
  angularDifference,
  boundsForPoints,
  clamp,
  dominantAxisOrientationDeg,
  normalizeAngleDeg,
  pathLength,
  strokeLength
} from "../utils/geometry.js";
import { recognitionPlanForSymbol } from "./signRotation.js";
import { scoreStrokeTemplate } from "./templateMatcher.js";

const RECOGNITION_AMBIGUITY_GAP = 0.065;
const SIMPLE_SIGN_STROKE_LIMIT = 6;
const SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE = 0.78;
const templateFeatureCache = new WeakMap();

function allowedLayerScore(entry, candidate) {
  if (candidate.layer === "any") {
    return 1;
  }
  if (!entry.allowedLayers?.length) {
    return 0.75;
  }
  if (entry.allowedLayers.includes(candidate.layer)) {
    return 1;
  }
  if (candidate.nearBoundary) {
    return 0.72;
  }
  return 0.34;
}

function rangeScore(value, min, max) {
  if (value < min) {
    return clamp(value / Math.max(0.001, min));
  }
  if (value > max) {
    return clamp(1 - (value - max) / Math.max(0.001, max));
  }
  return 1;
}

function entryStrokeTemplate(entry) {
  return entry.strokeTemplate ?? null;
}

function recognitionThresholds(config) {
  const recognition = config.recognition ?? {};
  return {
    minConfidence: recognition.minConfidence ?? 0.48,
    ambiguityGap: RECOGNITION_AMBIGUITY_GAP
  };
}

function aspectRatio(width, height) {
  return Math.max(0.001, width) / Math.max(0.001, height);
}

function rotatedAspectRatio(ratio, rotationDeg) {
  const normalized = Math.abs((normalizeAngleDeg(rotationDeg) % 180) - 90);
  const blend = 1 - normalized / 90;
  const logRatio = Math.log(Math.max(0.001, ratio));
  return Math.exp(logRatio * (1 - blend * 2));
}

function aspectCompatibility(candidateRatio, templateRatio, rotationDeg) {
  const adjustedCandidateRatio = rotatedAspectRatio(candidateRatio, rotationDeg);
  const distance = Math.abs(Math.log(adjustedCandidateRatio / Math.max(0.001, templateRatio)));
  return clamp(1 - distance / 1.1);
}

function undirectedAngularDifference(a, b) {
  const difference = angularDifference(a, b);
  return Math.min(difference, Math.abs(180 - difference));
}

function strokeLengthProfile(strokes, pointGetter) {
  const lengths = strokes
    .map((stroke) => pathLength(pointGetter(stroke)))
    .filter((length) => length > 0.0001)
    .sort((a, b) => b - a);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) {
    return [];
  }
  return lengths.map((length) => length / total);
}

function profileCompatibility(candidateProfile, templateProfile) {
  const count = Math.max(candidateProfile.length, templateProfile.length);
  if (!count) {
    return 1;
  }

  let distance = 0;
  for (let index = 0; index < count; index += 1) {
    distance += Math.abs((candidateProfile[index] ?? 0) - (templateProfile[index] ?? 0));
  }
  return clamp(1 - distance / 1.4);
}

function strokeCountCompatibility(candidateCount, templateCount) {
  if (!candidateCount || !templateCount) {
    return 0;
  }
  return clamp(1 - Math.abs(candidateCount - templateCount) / Math.max(candidateCount, templateCount));
}

function templateFeatures(strokeTemplate) {
  const cached = templateFeatureCache.get(strokeTemplate);
  if (cached) {
    return cached;
  }

  const strokes = strokeTemplate?.strokes ?? [];
  const points = strokes.flat();
  const bounds = boundsForPoints(points);
  const width = Math.max(0.001, bounds.width);
  const height = Math.max(0.001, bounds.height);
  const features = {
    aspectRatio: aspectRatio(width, height),
    elongation: Math.max(width, height) / Math.max(0.001, Math.min(width, height)),
    strokeCount: strokes.length,
    orientationDeg: dominantAxisOrientationDeg(points),
    strokeProfile: strokeLengthProfile(strokes, (stroke) => stroke)
  };
  templateFeatureCache.set(strokeTemplate, features);
  return features;
}

function candidateFeatures(candidate) {
  const bounds = candidate.bounds;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const elongation = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const strokeProfiles = candidate.strokes
    .map((stroke) => {
      const length = strokeLength(stroke);
      return { length };
    })
    .sort((a, b) => b.length - a.length);
  const totalStrokeLength = strokeProfiles.reduce((sum, stroke) => sum + stroke.length, 0);
  const dominantStroke = strokeProfiles[0] ?? { length: 0 };
  const secondaryStroke = strokeProfiles[1] ?? { length: 0 };
  const strokeLengthImbalance =
    strokeProfiles.length > 1
      ? (dominantStroke.length - secondaryStroke.length) / Math.max(0.001, totalStrokeLength)
      : 0;
  const elongationNorm = clamp((elongation - 1) / 3);
  const axisDominance = clamp(strokeLengthImbalance * 1.35 + elongationNorm * 0.35);

  return {
    aspectRatio: aspectRatio(width, height),
    elongation,
    elongationNorm,
    strokeCount: candidate.strokes.length,
    strokeLengthImbalance,
    axisDominance,
    strokeProfile: strokeLengthProfile(candidate.strokes, (stroke) => stroke.points ?? [])
  };
}

function structuralCompatibility(kind, entry, candidate, features, templateMatch) {
  const template = templateFeatures(entry.strokeTemplate);
  const aspectScore = aspectCompatibility(features.aspectRatio, template.aspectRatio, templateMatch.rotationDeg ?? 0);
  const overdrawCompatible =
    templateMatch.candidateExplainedRatio >= 0.9 &&
    templateMatch.templateCoveredRatio >= 0.82 &&
    templateMatch.unexplainedInkRatio <= 0.16;
  const rawCountScore = strokeCountCompatibility(features.strokeCount, template.strokeCount);
  const rawProfileScore = profileCompatibility(features.strokeProfile, template.strokeProfile);
  const countScore =
    overdrawCompatible && features.strokeCount > template.strokeCount
      ? Math.max(rawCountScore, 0.86)
      : rawCountScore;
  const profileScore =
    overdrawCompatible && features.strokeCount > template.strokeCount
      ? Math.max(rawProfileScore, 0.82)
      : rawProfileScore;
  const rotatedCandidateAxis = normalizeAngleDeg(candidate.orientationDeg + (templateMatch.rotationDeg ?? 0));
  const axisScore = clamp(1 - undirectedAngularDifference(rotatedCandidateAxis, template.orientationDeg) / 90);
  const smallSign = kind === "sign" && template.strokeCount <= SIMPLE_SIGN_STROKE_LIMIT;
  const strokeStructureScore = smallSign
    ? countScore * 0.58 + profileScore * 0.42
    : countScore * 0.24 + profileScore * 0.76;
  const score =
    kind === "sign"
      ? strokeStructureScore * 0.68 + aspectScore * 0.2 + axisScore * 0.12
      : aspectScore * 0.54 + profileScore * 0.28 + countScore * 0.18;

  return {
    score: clamp(score),
    aspectScore,
    strokeCountScore: countScore,
    strokeProfileScore: profileScore,
    axisScore,
    candidateAspectRatio: features.aspectRatio,
    templateAspectRatio: template.aspectRatio,
    candidateStrokeCount: features.strokeCount,
    templateStrokeCount: template.strokeCount
  };
}

function isContaminatedMatch(candidate, best) {
  const templateMatch = best?.templateMatch;
  if (!templateMatch) {
    return false;
  }

  const highRiskExtraInk =
    templateMatch.contaminationRisk >= 0.62 &&
    templateMatch.unexplainedInkRatio >= 0.34;
  const oversizedWeakMatch =
    candidate.sizeNorm >= 0.42 &&
    templateMatch.unexplainedInkRatio >= 0.26 &&
    best.confidence < 0.7;
  const wrongRegionInk =
    templateMatch.forbiddenCellInkRatio >= 0.42 &&
    templateMatch.requiredCellCoverage <= 0.82 &&
    best.confidence < 0.72;

  return highRiskExtraInk || oversizedWeakMatch || wrongRegionInk;
}

function isMessyMatch(candidate, best) {
  const templateMatch = best?.templateMatch;
  if (!templateMatch) {
    return false;
  }

  return (
    candidate.overdrawAmount >= 0.24 ||
    candidate.neatness <= 0.74 ||
    (templateMatch.candidateExplainedRatio >= 0.9 && templateMatch.softDiceScore < 0.74)
  );
}

function recognitionStatus(candidate, best, second, secondSameKind, accepted, thresholds) {
  if (!best) {
    return "unknown";
  }
  if (isContaminatedMatch(candidate, best)) {
    return "contaminated";
  }
  if (best.structuralMatch?.score < 0.42 && best.confidence < 0.7) {
    return "ambiguous";
  }
  if (!accepted) {
    return "unknown";
  }

  const competitor = Math.max(second.confidence ?? 0, secondSameKind.confidence ?? 0);
  const bestInk = best.templateMatch ?? {};
  const clearInkIdentity =
    bestInk.inkScore >= 0.92 &&
    bestInk.candidateExplainedRatio >= 0.98 &&
    bestInk.templateCoveredRatio >= 0.98;
  if (!clearInkIdentity && best.confidence - competitor < thresholds.ambiguityGap) {
    return "ambiguous";
  }
  if (isMessyMatch(candidate, best)) {
    return "valid_messy";
  }
  return "valid";
}

function scoreByStrokeTemplate(kind, entry, candidate, features) {
  const layerScore = allowedLayerScore(entry, candidate);
  const strokeTemplate = entryStrokeTemplate(entry);

  if (!strokeTemplate?.strokes?.length) {
    return {
      confidence: 0,
      templateMatch: null
    };
  }

  const recognitionPlan = recognitionPlanForSymbol(kind, entry, candidate);
  const matchFeatures = kind === "sign" ? candidateFeatures(recognitionPlan.candidate) : features;
  const rawTemplateMatch = scoreStrokeTemplate(recognitionPlan.candidate, strokeTemplate, recognitionPlan.options);
  const templateMatch = {
    ...rawTemplateMatch,
    rotationDeg: normalizeAngleDeg(recognitionPlan.baseRotationDeg + (rawTemplateMatch.rotationDeg ?? 0)),
    recognitionRotationDeg:
      normalizeAngleDeg(
        recognitionPlan.baseRotationDeg +
          (rawTemplateMatch.recognitionRotationDeg ?? rawTemplateMatch.rotationDeg ?? 0)
      )
  };
  const structuralMatch = structuralCompatibility(
    kind,
    entry,
    recognitionPlan.candidate,
    matchFeatures,
    rawTemplateMatch
  );
  const sizeScore = rangeScore(candidate.sizeNorm, 0.045, 0.46);
  const simpleSignStructureMultiplier =
    kind === "sign" && structuralMatch.templateStrokeCount <= SIMPLE_SIGN_STROKE_LIMIT
      ? 0.42 + structuralMatch.strokeCountScore * 0.58
      : 1;
  const simpleSignIncompleteCap =
    kind === "sign" &&
    structuralMatch.templateStrokeCount <= SIMPLE_SIGN_STROKE_LIMIT &&
    templateMatch.templateCoveredRatio < SIMPLE_SIGN_MIN_TEMPLATE_COVERAGE
      ? 0.44
      : 1;
  const grossStructureMismatchCap =
    structuralMatch.score < 0.18 && templateMatch.templateCoveredRatio < 0.5 ? 0.44 : 1;
  const contextualScore =
    templateMatch.confidence * 0.68 +
    structuralMatch.score * 0.13 +
    layerScore * 0.1 +
    sizeScore * 0.04 +
    candidate.neatness * 0.05;
  const contextLiftCap = templateMatch.confidence + 0.035;
  return {
    confidence: Math.min(
      clamp(Math.min(contextualScore, contextLiftCap) * simpleSignStructureMultiplier),
      simpleSignIncompleteCap,
      grossStructureMismatchCap
    ),
    templateMatch,
    structuralMatch
  };
}

function publicCandidate(candidate) {
  return {
    candidateId: candidate.candidateId,
    strokeIds: candidate.strokeIds,
    rawStrokeCount: candidate.rawStrokeCount,
    layer: candidate.layer,
    nearBoundary: candidate.nearBoundary,
    radiusNorm: candidate.radiusNorm,
    angleDeg: candidate.angleDeg,
    sizeNorm: candidate.sizeNorm,
    lengthNorm: candidate.lengthNorm,
    orientationDeg: candidate.orientationDeg,
    directedOrientationDeg: candidate.directedOrientationDeg,
    radialFacing: candidate.radialFacing,
    overdrawAmount: candidate.overdrawAmount,
    neatness: candidate.neatness
  };
}

// Recognition scores each grouped symbol candidate against every dictionary
// sigil and sign:
// 1. Extract candidate geometry such as aspect ratio, elongation, stroke count,
//    stroke-length profile, and neatness.
// 2. For signs, rotate the candidate into the bottom-of-ring canonical frame so
//    template matching can compare shape while preserving the original
//    ring-relative orientation as spell meaning.
// 3. Rasterize the candidate and dictionary template, test the allowed
//    rotations, and keep the best ink overlap, template coverage, and
//    unexplained-ink measurements.
// 4. Blend ink score with structural compatibility, layer fit, size fit, and
//    neatness, then cap obvious incomplete or contaminated matches.
// 5. Sort all dictionary matches, decide whether the best score is accepted,
//    ambiguous, contaminated, messy-valid, or unknown, and keep the top matches
//    only in diagnostics.
export function recognizeCandidates(candidates, dictionary, config) {
  const entries = [
    ...dictionary.sigils.map((entry) => ({ kind: "sigil", entry })),
    ...dictionary.signs.map((entry) => ({ kind: "sign", entry }))
  ];

  return candidates.map((candidate) => {
    const thresholds = recognitionThresholds(config);
    const features = candidateFeatures(candidate);
    const scored = entries
      .map(({ kind, entry }) => ({
        kind,
        entry,
        ...scoreByStrokeTemplate(kind, entry, candidate, features)
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];
    const second = scored[1] ?? { confidence: 0, entry: null, kind: null };
    const secondSameKind =
      scored.find((score) => score.kind === best?.kind && score.entry.id !== best?.entry.id) ?? {
        confidence: 0,
        entry: null,
        kind: null
      };
    const acceptedByConfidence = Boolean(best && best.confidence >= thresholds.minConfidence);
    const status = recognitionStatus(candidate, best, second, secondSameKind, acceptedByConfidence, thresholds);
    const accepted = acceptedByConfidence && (status === "valid" || status === "valid_messy");
    const bestTemplateMatch = best?.templateMatch ?? null;
    const bestStructuralMatch = best?.structuralMatch ?? null;
    const topMatches = scored.slice(0, 3).map((score) => ({
      kind: score.kind,
      id: score.entry.id,
      confidence: score.confidence,
      templateConfidence: score.templateMatch?.confidence ?? 0,
      inkScore: score.templateMatch?.inkScore ?? 0,
      candidateExplainedRatio: score.templateMatch?.candidateExplainedRatio ?? 0,
      templateCoveredRatio: score.templateMatch?.templateCoveredRatio ?? 0,
      structuralScore: score.structuralMatch?.score ?? 0,
      aspectScore: score.structuralMatch?.aspectScore ?? 0,
      strokeCountScore: score.structuralMatch?.strokeCountScore ?? 0,
      strokeProfileScore: score.structuralMatch?.strokeProfileScore ?? 0,
      rotationDeg: score.templateMatch?.rotationDeg ?? 0,
      recognitionRotationDeg: score.templateMatch?.recognitionRotationDeg ?? score.templateMatch?.rotationDeg ?? 0
    }));
    const bestGuess = best
      ? {
          kind: best.kind,
          id: best.entry.id,
          confidence: best.confidence
        }
      : null;

    return {
      ...publicCandidate(candidate),
      recognized: accepted,
      recognitionStatus: status,
      kind: accepted ? best.kind : "unknown",
      id: accepted ? best.entry.id : null,
      displayName: accepted ? best.entry.displayName : null,
      element: accepted ? best.entry.element ?? null : null,
      semantic: accepted ? best.entry.semantic ?? null : null,
      confidence: accepted ? best.confidence : 0,
      shape: {
        strokeCount: features.strokeCount,
        aspectRatio: features.aspectRatio,
        elongation: features.elongation,
        elongationNorm: features.elongationNorm,
        strokeLengthImbalance: features.strokeLengthImbalance,
        axisDominance: features.axisDominance
      },
      diagnostics: {
        bestGuess: accepted ? null : bestGuess,
        recognitionRotationDeg:
          bestTemplateMatch?.recognitionRotationDeg ?? bestTemplateMatch?.rotationDeg ?? 0,
        template: {
          inkScore: bestTemplateMatch?.inkScore ?? 0,
          softDiceScore: bestTemplateMatch?.softDiceScore ?? 0,
          candidateExplainedRatio: bestTemplateMatch?.candidateExplainedRatio ?? 0,
          templateCoveredRatio: bestTemplateMatch?.templateCoveredRatio ?? 0,
          unexplainedInkRatio: bestTemplateMatch?.unexplainedInkRatio ?? 1,
          missingInkRatio: bestTemplateMatch?.missingInkRatio ?? 1,
          contaminationRisk: bestTemplateMatch?.contaminationRisk ?? 0,
          forbiddenCellInkRatio: bestTemplateMatch?.forbiddenCellInkRatio ?? 1
        },
        structure: {
          score: bestStructuralMatch?.score ?? 0,
          aspectScore: bestStructuralMatch?.aspectScore ?? 0,
          strokeCountScore: bestStructuralMatch?.strokeCountScore ?? 0,
          strokeProfileScore: bestStructuralMatch?.strokeProfileScore ?? 0,
          axisScore: bestStructuralMatch?.axisScore ?? 0,
          candidateAspectRatio: bestStructuralMatch?.candidateAspectRatio ?? features.aspectRatio,
          templateAspectRatio: bestStructuralMatch?.templateAspectRatio ?? 1,
          candidateStrokeCount: bestStructuralMatch?.candidateStrokeCount ?? features.strokeCount,
          templateStrokeCount: bestStructuralMatch?.templateStrokeCount ?? 0
        },
        topMatches
      }
    };
  });
}
