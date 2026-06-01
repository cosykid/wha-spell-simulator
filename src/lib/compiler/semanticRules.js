import { clamp, clampSigned, vectorFromAngleDeg } from "../utils/geometry.js";

const DELTA_TARGETS = ["force", "focus", "spread", "range", "lifetimeBias"];

const INWARD_DIRECTION_OFFSET_DEG = 180;

const SIGN_SHAPE_TUNING = {
  forceImbalanceOffset: 0.08,
  forceImbalanceScale: 0.34,
  forceMax: 0.18,
  focusElongationOffset: 0.12,
  focusElongationScale: 0.2,
  focusMax: 0.12,
  directionAxisOffset: 0.1,
  directionAxisScale: 0.95,
  directionMax: 0.58
};

const SIGN_INFLUENCE_TUNING = {
  sizeBase: 0.68,
  sizeScale: 2.4,
  sizeMin: 0.45,
  sizeMax: 1.25,
  lengthBase: 0.72,
  lengthScale: 1.8,
  lengthMin: 0.45,
  lengthMax: 1.22,
  layerOuter: 1,
  layerMiddle: 0.88,
  layerOther: 0.62,
  distanceBase: 0.76,
  distanceScale: 0.34,
  distanceMin: 0.58,
  distanceMax: 1.14,
  featureBoostBase: 1,
  featureBoostMin: 0.35,
  featureBoostMax: 1.85,
  minimumDirectionMagnitude: 0.001
};

const CONVERGENCE_TUNING = {
  pointScale: 0.42,
  pointLimit: 0.5,
  radiusBase: 0.3,
  radiusStrengthScale: 0.16,
  radiusSizeScale: 0.42,
  radiusInnerBiasScale: 0.04,
  radiusMin: 0.06,
  radiusMax: 0.3,
  rigidityBase: 0.58,
  rigiditySizeScale: 2.1,
  rigidityRadiusScale: 0.18
};

function manifestationId(sign) {
  return sign.semantic?.manifestation ?? sign.id;
}

function signDirection(sign) {
  switch (sign.semantic?.directionMode) {
    case "orientation":
      return vectorFromAngleDeg(sign.directedOrientationDeg ?? sign.orientationDeg);
    case "inward":
      return vectorFromAngleDeg(sign.angleDeg + INWARD_DIRECTION_OFFSET_DEG);
    case "position":
    default:
      return vectorFromAngleDeg(sign.angleDeg);
  }
}

function signShapeDeltas(sign) {
  const shape = sign.shape ?? {};
  const axisDominance = shape.axisDominance ?? 0;
  const strokeLengthImbalance = shape.strokeLengthImbalance ?? 0;
  const elongationNorm = shape.elongationNorm ?? 0;

  return {
    force: clamp(
      (strokeLengthImbalance - SIGN_SHAPE_TUNING.forceImbalanceOffset) *
        SIGN_SHAPE_TUNING.forceImbalanceScale,
      0,
      SIGN_SHAPE_TUNING.forceMax
    ),
    focus: clamp(
      (elongationNorm - SIGN_SHAPE_TUNING.focusElongationOffset) * SIGN_SHAPE_TUNING.focusElongationScale,
      0,
      SIGN_SHAPE_TUNING.focusMax
    ),
    spread: 0,
    range: 0,
    lifetimeBias: 0,
    directionWeight: clamp(
      (axisDominance - SIGN_SHAPE_TUNING.directionAxisOffset) * SIGN_SHAPE_TUNING.directionAxisScale,
      0,
      SIGN_SHAPE_TUNING.directionMax
    )
  };
}

export function signInfluence(sign) {
  const sizeWeight = clamp(
    SIGN_INFLUENCE_TUNING.sizeBase + sign.sizeNorm * SIGN_INFLUENCE_TUNING.sizeScale,
    SIGN_INFLUENCE_TUNING.sizeMin,
    SIGN_INFLUENCE_TUNING.sizeMax
  );
  const lengthWeight = clamp(
    SIGN_INFLUENCE_TUNING.lengthBase + sign.lengthNorm * SIGN_INFLUENCE_TUNING.lengthScale,
    SIGN_INFLUENCE_TUNING.lengthMin,
    SIGN_INFLUENCE_TUNING.lengthMax
  );
  const layerWeight =
    sign.layer === "outer"
      ? SIGN_INFLUENCE_TUNING.layerOuter
      : sign.layer === "middle"
        ? SIGN_INFLUENCE_TUNING.layerMiddle
        : SIGN_INFLUENCE_TUNING.layerOther;
  const distanceWeight = clamp(
    SIGN_INFLUENCE_TUNING.distanceBase + sign.radiusNorm * SIGN_INFLUENCE_TUNING.distanceScale,
    SIGN_INFLUENCE_TUNING.distanceMin,
    SIGN_INFLUENCE_TUNING.distanceMax
  );
  return clamp(
    sign.confidence *
      sign.neatness *
      sizeWeight *
      lengthWeight *
      layerWeight *
      distanceWeight
  );
}

function convergenceProfile(weightedSigns, strength) {
  const totalInfluence = weightedSigns.reduce((sum, entry) => sum + entry.influence, 0);
  if (!totalInfluence) {
    return {
      point: { x: 0, y: 0 },
      radius: CONVERGENCE_TUNING.radiusMax,
      rigidity: 0
    };
  }

  const weighted = weightedSigns.reduce(
    (sum, { sign, influence }) => {
      const radial = clamp(sign.radiusNorm ?? 0.5);
      const direction = vectorFromAngleDeg(sign.angleDeg ?? 0);
      const size = sign.sizeNorm ?? 0;
      const placementWeight = influence * (0.7 + radial * 0.45);

      return {
        x: sum.x + direction.x * radial * placementWeight,
        y: sum.y + direction.y * radial * placementWeight,
        placementWeight: sum.placementWeight + placementWeight,
        size: sum.size + size * influence,
        radius: sum.radius + radial * influence
      };
    },
    { x: 0, y: 0, placementWeight: 0, size: 0, radius: 0 }
  );

  const averageSize = weighted.size / totalInfluence;
  const averageRadius = weighted.radius / totalInfluence;
  const x =
    weighted.placementWeight > 0
      ? (weighted.x / weighted.placementWeight) * CONVERGENCE_TUNING.pointScale
      : 0;
  const y =
    weighted.placementWeight > 0
      ? (weighted.y / weighted.placementWeight) * CONVERGENCE_TUNING.pointScale
      : 0;

  return {
    point: {
      x: clampSigned(x, CONVERGENCE_TUNING.pointLimit),
      y: clampSigned(y, CONVERGENCE_TUNING.pointLimit)
    },
    radius: clamp(
      CONVERGENCE_TUNING.radiusBase -
        strength * CONVERGENCE_TUNING.radiusStrengthScale -
        averageSize * CONVERGENCE_TUNING.radiusSizeScale +
        (1 - averageRadius) * CONVERGENCE_TUNING.radiusInnerBiasScale,
      CONVERGENCE_TUNING.radiusMin,
      CONVERGENCE_TUNING.radiusMax
    ),
    rigidity: clamp(
      strength *
        (CONVERGENCE_TUNING.rigidityBase +
          averageSize * CONVERGENCE_TUNING.rigiditySizeScale +
          averageRadius * CONVERGENCE_TUNING.rigidityRadiusScale)
    )
  };
}

function signDirectionWeight(sign) {
  const featureDeltas = signShapeDeltas(sign);
  return (
    signInfluence(sign) *
    clamp(
      SIGN_INFLUENCE_TUNING.featureBoostBase + featureDeltas.directionWeight,
      SIGN_INFLUENCE_TUNING.featureBoostMin,
      SIGN_INFLUENCE_TUNING.featureBoostMax
    )
  );
}

export function aggregateManifestations(signs) {
  if (!signs.length) {
    return {
      primaryManifestation: "aura",
      manifestations: {
        aura: {
          strength: 1
        }
      },
      manifestationInfluence: {
        aura: 0
      }
    };
  }

  const groups = new Map();
  signs.forEach((sign) => {
    const id = manifestationId(sign);
    const influence = signInfluence(sign);
    const group = groups.get(id) ?? { id, totalInfluence: 0, signs: [] };
    group.totalInfluence += influence;
    group.signs.push({ sign, influence });
    groups.set(id, group);
  });

  const sortedGroups = [...groups.values()].sort((a, b) => b.totalInfluence - a.totalInfluence);
  const manifestations = Object.fromEntries(
    sortedGroups.map((group) => {
      const strength = clamp(group.totalInfluence);
      const base = { strength };

      if (group.id === "convergence") {
        return [group.id, { ...base, ...convergenceProfile(group.signs, strength) }];
      }

      return [group.id, base];
    })
  );

  return {
    primaryManifestation: sortedGroups[0]?.id ?? "aura",
    manifestations,
    manifestationInfluence: Object.fromEntries(sortedGroups.map((group) => [group.id, group.totalInfluence]))
  };
}

export function combineSignDirection(signs) {
  const vector = signs.reduce(
    (sum, sign) => {
      const influence = signDirectionWeight(sign);
      const direction = signDirection(sign);
      return {
        x: sum.x + direction.x * influence,
        y: sum.y + direction.y * influence,
        weight: sum.weight + influence
      };
    },
    { x: 0, y: 0, weight: 0 }
  );

  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude < SIGN_INFLUENCE_TUNING.minimumDirectionMagnitude) {
    return { x: 0, y: 0, strength: 0 };
  }

  const strength = clamp(magnitude / Math.max(SIGN_INFLUENCE_TUNING.minimumDirectionMagnitude, vector.weight));
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    strength
  };
}

export function aggregateSemanticDeltas(signs) {
  return signs.reduce(
    (sum, sign) => {
      const influence = signInfluence(sign);
      const semantic = sign.semantic ?? {};
      const featureDeltas = signShapeDeltas(sign);
      return Object.fromEntries(
        DELTA_TARGETS.map((target) => [
          target,
          sum[target] + ((semantic[target] ?? 0) + featureDeltas[target]) * influence
        ])
      );
    },
    { force: 0, focus: 0, spread: 0, range: 0, lifetimeBias: 0 }
  );
}
