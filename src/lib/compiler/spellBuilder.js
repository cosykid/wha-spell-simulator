import { GLYPH_WARNINGS } from "../parser/glyphWarnings.js";
import { clamp } from "../utils/geometry.js";
import {
  aggregateManifestations,
  aggregateSemanticDeltas,
  combineSignDirection,
  signInfluence
} from "./semanticRules.js";
import { directionFromSurfaceVector } from "./spellDirection.js";
import { calculateSpellQuality, calculateSpellStability } from "./spellQuality.js";

const PRIMARY_SIGIL_AMBIGUITY_GAP = 0.05;

const SUPPORTED_ELEMENTS = new Set(["fire", "water", "wind", "earth", "light"]);

const SPELL_PARAMETER_TUNING = {
  focusBase: 0.46,
  focusQuality: 0.2,
  spreadBase: 0.32,
  spreadInverseFocus: 0.28,
  forceBase: 0.34,
  forceSignPower: 0.34,
  forceQuality: 0.18,
  rangeBase: 0.42,
  rangeSignPower: 0.18,
  durationMinSeconds: 0.65,
  durationMaxSeconds: 8.5,
  durationSecondsScale: 6.4,
  durationQualityWeight: 0.35,
  durationNeatnessWeight: 0.65,
  durationCurve: 1.45
};

const PHYSICS_TUNING = {
  levitationGravityScale: 0.42
};

function sameKindAlternateConfidence(recognition) {
  return (
    recognition.diagnostics?.topMatches?.find((score) => score.kind === recognition.kind && score.id !== recognition.id)?.confidence ??
    0
  );
}

function invalidSpell(status, glyphAST, warnings = []) {
  const ringComplete = Boolean(glyphAST.ring?.complete);
  const combinedWarnings = [...new Set([...(glyphAST.warnings ?? []), ...warnings])];
  return {
    type: "SpellIR",
    active: false,
    prepared: false,
    valid: false,
    status,
    activatedAt: null,
    element: null,
    elementConfidence: 0,
    primarySizeNorm: 0,
    effectScale: 1,
    primaryManifestation: "none",
    manifestations: {},
    direction: { x: 0, y: 0, z: 1, xTiltDeg: 0, yTiltDeg: 0, tiltFromZDeg: 0 },
    directionCoherence: 0,
    gravity: 1,
    force: 0,
    spread: 0,
    focus: 0,
    range: 0,
    duration: 0,
    stability: 0,
    quality: 0,
    neatness: glyphAST.globalMetrics?.neatness ?? 0,
    warnings: combinedWarnings,
    signature: `invalid:${status}:${ringComplete}:${glyphAST.ring?.completeness ?? 0}`
  };
}

function calculateSpellGravity(manifestationInfluence) {
  return clamp(1 - (manifestationInfluence.levitation ?? 0) * PHYSICS_TUNING.levitationGravityScale);
}

function manifestationSignature(manifestations) {
  return Object.entries(manifestations)
    .map(([id, manifestation]) => {
      const point = manifestation.point
        ? `.p${Math.round(manifestation.point.x * 100)}.${Math.round(manifestation.point.y * 100)}`
        : "";
      const radius = manifestation.radius === undefined ? "" : `.r${Math.round(manifestation.radius * 100)}`;
      return `${id}.${Math.round((manifestation.strength ?? 0) * 100)}${point}${radius}`;
    })
    .sort()
    .join(",");
}

function calculateSpellDuration({ primarySemantic, deltas, quality, neatness }) {
  const durationScore = clamp(
    quality * SPELL_PARAMETER_TUNING.durationQualityWeight +
      neatness * SPELL_PARAMETER_TUNING.durationNeatnessWeight +
      (primarySemantic.lifetimeBias ?? 0) +
      deltas.lifetimeBias
  );

  return clamp(
    SPELL_PARAMETER_TUNING.durationMinSeconds +
      Math.pow(durationScore, SPELL_PARAMETER_TUNING.durationCurve) * SPELL_PARAMETER_TUNING.durationSecondsScale,
    SPELL_PARAMETER_TUNING.durationMinSeconds,
    SPELL_PARAMETER_TUNING.durationMaxSeconds
  );
}

export function compileSpell({ glyphAST, config }) {
  if (!glyphAST?.ring?.found) {
    return invalidSpell("No ring detected", glyphAST ?? { globalMetrics: {} });
  }

  if (glyphAST.ring.unsupportedMultipleRings?.length) {
    return invalidSpell("Multiple rings detected", glyphAST, [GLYPH_WARNINGS.unsupportedMultipleRings]);
  }

  if (glyphAST.unsupportedMultipleSigils?.length) {
    return invalidSpell("Multiple sigils detected", glyphAST, [GLYPH_WARNINGS.unsupportedMultipleSigils]);
  }

  const primary = glyphAST.primarySigil;
  if (!primary) {
    return invalidSpell("Invalid spell", glyphAST, [GLYPH_WARNINGS.missingPrimarySigil]);
  }

  if (primary.confidence < config.compiler.minimumPrimarySigilConfidence) {
    return invalidSpell("Invalid spell", glyphAST, [GLYPH_WARNINGS.primarySigilConfidenceLow]);
  }

  const confidenceGap = primary.confidence - sameKindAlternateConfidence(primary);
  if (confidenceGap < PRIMARY_SIGIL_AMBIGUITY_GAP) {
    return invalidSpell("Ambiguous sigil", glyphAST, [GLYPH_WARNINGS.primarySigilAmbiguous]);
  }

  if (!primary.element) {
    return invalidSpell("Unsupported element", glyphAST, [GLYPH_WARNINGS.primaryElementMissing]);
  }

  if (!SUPPORTED_ELEMENTS.has(primary.element)) {
    return invalidSpell("Unsupported element", glyphAST, [GLYPH_WARNINGS.primaryElementUnsupported]);
  }

  const signs = glyphAST.signs ?? [];
  const quality = calculateSpellQuality(glyphAST);
  const stability = calculateSpellStability(glyphAST, config);
  const neatness = glyphAST.globalMetrics?.neatness ?? quality;
  const { primaryManifestation, manifestations, manifestationInfluence } = aggregateManifestations(signs);
  const deltas = aggregateSemanticDeltas(signs);
  const surfaceDirection = signs.length ? combineSignDirection(signs) : { x: 0, y: 0, strength: 0 };
  const directionCoherence = surfaceDirection.strength ?? 0;
  const signPower = signs.reduce((sum, sign) => sum + signInfluence(sign), 0);
  const active = Boolean(glyphAST.ring.complete);
  const prepared = !active;
  const primarySemantic = primary.semantic ?? {};
  const effectScale = clamp(
    config.renderer.effectSize.baseScale + primary.sizeNorm * config.renderer.effectSize.sigilSizeInfluence,
    config.renderer.effectSize.minScale,
    config.renderer.effectSize.maxScale
  );

  const focus = clamp(
    SPELL_PARAMETER_TUNING.focusBase +
      (primarySemantic.focus ?? 0) +
      deltas.focus +
      quality * SPELL_PARAMETER_TUNING.focusQuality
  );
  const spread = clamp(
    SPELL_PARAMETER_TUNING.spreadBase +
      (primarySemantic.spread ?? 0) +
      deltas.spread +
      (1 - focus) * SPELL_PARAMETER_TUNING.spreadInverseFocus
  );

  const force = clamp(
    SPELL_PARAMETER_TUNING.forceBase +
      (primarySemantic.force ?? 0) +
      signPower * SPELL_PARAMETER_TUNING.forceSignPower +
      deltas.force +
      quality * SPELL_PARAMETER_TUNING.forceQuality
  );
  const range = clamp(
    SPELL_PARAMETER_TUNING.rangeBase +
      (primarySemantic.range ?? 0) +
      deltas.range +
      signPower * SPELL_PARAMETER_TUNING.rangeSignPower
  );
  const duration = calculateSpellDuration({ primarySemantic, deltas, quality, neatness });
  const direction = directionFromSurfaceVector(surfaceDirection, force);
  const gravity = calculateSpellGravity(manifestationInfluence);

  return {
    type: "SpellIR",
    active,
    prepared,
    valid: true,
    status: active ? "Active spell" : "Prepared spell",
    activatedAt: active ? performance.now() : null,
    element: primary.element,
    elementConfidence: primary.confidence,
    primarySizeNorm: primary.sizeNorm,
    effectScale,
    primaryManifestation,
    manifestations,
    direction,
    directionCoherence,
    gravity,
    force,
    spread,
    focus,
    range,
    duration,
    stability,
    quality,
    neatness,
    warnings: glyphAST.warnings ?? [],
    signature: `${primary.id}:${manifestationSignature(manifestations)}:${active}:${Math.round(effectScale * 100)}:${Math.round(
      force * 100
    )}:${Math.round(spread * 100)}:${Math.round(duration * 100)}:${Math.round(direction.xTiltDeg)}:${Math.round(
      direction.yTiltDeg
    )}:${Math.round(directionCoherence * 100)}:${Math.round(gravity * 100)}:${Math.round(
      quality * 100
    )}:${Math.round(stability * 100)}`
  };
}
