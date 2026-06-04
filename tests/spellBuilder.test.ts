import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../src/lib/config.js";
import { compileSpell } from "../src/lib/compiler/spellBuilder.js";
import { GLYPH_WARNINGS } from "../src/lib/parser/glyphWarnings.js";
import type { GlyphAST, Semantic } from "../src/lib/types.js";

/** Minimal shape of a sign fixture as consumed by compileSpell's semantic rules. */
interface SignFixture {
  id: string;
  confidence: number;
  neatness: number;
  sizeNorm: number;
  lengthNorm: number;
  layer: string;
  radiusNorm: number;
  angleDeg: number;
  orientationDeg: number;
  directedOrientationDeg: number;
  radialFacing: string;
  shape: Record<string, number>;
  semantic: Semantic;
}

/** Minimal ring summary shape used in unsupportedMultipleRings fixtures. */
interface RingSummary {
  center: { x: number; y: number };
  radius: number;
  complete: boolean;
  completeness: number;
  strokeIds: string[];
}

function glyphAST({
  ringComplete = false,
  primarySigil = true,
  element = "fire",
  omitElement = false,
  signs = [] as SignFixture[],
  unsupportedMultipleRings = [] as RingSummary[],
  ringNeatness = 0.78,
  primaryNeatness = 0.82,
  globalNeatness = 0.8
}: {
  ringComplete?: boolean;
  primarySigil?: boolean;
  element?: string;
  omitElement?: boolean;
  signs?: SignFixture[];
  unsupportedMultipleRings?: RingSummary[];
  ringNeatness?: number;
  primaryNeatness?: number;
  globalNeatness?: number;
} = {}) {
  const elementFields =
    omitElement
      ? {}
      : {
          element
        };

  return {
    type: "GlyphAST",
    version: CONFIG.appVersion,
    ring: {
      found: true,
      complete: ringComplete,
      completeness: ringComplete ? 1 : 0.82,
      neatness: ringNeatness,
      unsupportedMultipleRings
    },
    primarySigil: primarySigil
      ? {
          id: "fire",
          ...elementFields,
          confidence: 0.91,
          sizeNorm: 0.2,
          neatness: primaryNeatness,
          semantic: {
            force: 0.12,
            spread: 0,
            focus: 0.1,
            range: 0,
            lifetimeBias: 0
          }
        }
      : null,
    signs,
    unknowns: [],
    globalMetrics: {
      neatness: globalNeatness,
      radialSymmetry: 0.9,
      instability: 0.12
    },
    warnings: primarySigil ? [] : [GLYPH_WARNINGS.missingPrimarySigil]
  } as unknown as GlyphAST;
}

test("compiles prepared and active spell states without ringActivated", () => {
  const prepared = compileSpell({ glyphAST: glyphAST(), config: CONFIG });
  const active = compileSpell({ glyphAST: glyphAST({ ringComplete: true }), config: CONFIG });

  assert.equal(prepared.valid, true);
  assert.equal(prepared.active, false);
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.activatedAt, null);
  assert.equal(Object.hasOwn(prepared, "ringActivated"), false);
  assert.equal(Object.hasOwn(prepared, "modifiers"), false);
  assert.equal(Object.hasOwn(prepared, "motionMode"), false);
  assert.equal(Object.hasOwn(prepared, "manifestation"), false);
  assert.equal(Object.hasOwn(prepared, "directionStrength"), false);
  assert.equal(prepared.primaryManifestation, "aura");
  assert.deepEqual(prepared.manifestations, { aura: { strength: 1 } });

  assert.equal(active.valid, true);
  assert.equal(active.active, true);
  assert.equal(active.prepared, false);
  assert.equal(typeof active.activatedAt, "number");
  assert.equal(Object.hasOwn(active, "ringActivated"), false);
  assert.equal(Object.hasOwn(active, "manifestation"), false);
});

test("derives spell duration as a longer lifetime for cleaner drawings", () => {
  const cleanSpell = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      ringNeatness: 0.95,
      primaryNeatness: 0.94,
      globalNeatness: 0.95
    }),
    config: CONFIG
  });
  const roughSpell = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      ringNeatness: 0.34,
      primaryNeatness: 0.36,
      globalNeatness: 0.33
    }),
    config: CONFIG
  });

  assert.ok(cleanSpell.duration > roughSpell.duration);
  assert.ok(cleanSpell.duration > 4);
  assert.ok(roughSpell.duration < 3);
});

test("compiles effect direction as paper-local 3D tilt", () => {
  const spellIR = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      signs: [
        {
          id: "direction-test",
          confidence: 0.95,
          neatness: 0.92,
          sizeNorm: 0.12,
          lengthNorm: 0.08,
          layer: "outer",
          radiusNorm: 0.82,
          angleDeg: 90,
          orientationDeg: 90,
          directedOrientationDeg: 90,
          radialFacing: "outward",
          shape: {
            axisDominance: 0.4,
            strokeLengthImbalance: 0.12,
            elongationNorm: 0.16
          },
          semantic: {
            directionMode: "orientation"
          }
        }
      ]
    }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, true);
  assert.equal(typeof spellIR.direction.x, "number");
  assert.equal(typeof spellIR.direction.y, "number");
  assert.equal(typeof spellIR.direction.z, "number");
  assert.equal(typeof spellIR.direction.xTiltDeg, "number");
  assert.equal(typeof spellIR.direction.yTiltDeg, "number");
  assert.equal(typeof spellIR.direction.tiltFromZDeg, "number");
  assert.ok(spellIR.direction.y < 0);
  assert.ok(spellIR.direction.z > 0);
  assert.ok(spellIR.direction.tiltFromZDeg > 0);
});

test("compiles a left-side column sign as rightward flow", () => {
  const spellIR = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      signs: [
        {
          id: "column",
          confidence: 0.95,
          neatness: 0.92,
          sizeNorm: 0.12,
          lengthNorm: 0.22,
          layer: "outer",
          radiusNorm: 0.82,
          angleDeg: 180,
          orientationDeg: 270,
          directedOrientationDeg: 270,
          radialFacing: "outward",
          shape: {
            axisDominance: 0.4,
            strokeLengthImbalance: 0.16,
            elongationNorm: 0.22
          },
          semantic: {
            manifestation: "column",
            directionMode: "inward",
            force: 0.3,
            focus: 0.35,
            spread: -0.24,
            range: 0.18
          }
        }
      ]
    }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, true);
  assert.equal(spellIR.primaryManifestation, "column");
  assert.ok(spellIR.manifestations.column.strength > 0);
  assert.ok(spellIR.direction.x > 0);
  assert.ok(Math.abs(spellIR.direction.y) < 0.001);
  assert.ok(spellIR.direction.z > 0);
});

test("compiles balanced levitation signs as zero-gravity suspension", () => {
  const levitationSigns: SignFixture[] = [0, 90, 180, 270].map((angleDeg) => ({
    id: "levitation",
    confidence: 0.95,
    neatness: 0.92,
    sizeNorm: 0.12,
    lengthNorm: 0.18,
    layer: "outer",
    radiusNorm: 0.82,
    angleDeg,
    orientationDeg: angleDeg,
    directedOrientationDeg: angleDeg,
    radialFacing: "outward",
    shape: {
      axisDominance: 0.4,
      strokeLengthImbalance: 0.1,
      elongationNorm: 0.18
    },
    semantic: {
      manifestation: "levitation",
      directionMode: "orientation",
      force: 0.12,
      focus: 0.02,
      spread: 0.08,
      range: 0.18,
      lifetimeBias: 0.28
    }
  }));

  const spellIR = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      element: "water",
      signs: levitationSigns
    }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, true);
  assert.equal(spellIR.primaryManifestation, "levitation");
  assert.ok(spellIR.manifestations.levitation.strength > 0);
  assert.equal(spellIR.directionCoherence, 0);
  assert.equal(spellIR.gravity, 0);
  assert.equal(spellIR.direction.x, 0);
  assert.equal(spellIR.direction.y, 0);
  assert.equal(spellIR.direction.z, 1);
});

test("keeps independent manifestations active in the same spell", () => {
  const signs: SignFixture[] = [
    {
      id: "levitation",
      confidence: 0.95,
      neatness: 0.92,
      sizeNorm: 0.12,
      lengthNorm: 0.18,
      layer: "outer",
      radiusNorm: 0.82,
      angleDeg: 0,
      orientationDeg: 0,
      directedOrientationDeg: 0,
      radialFacing: "outward",
      shape: {
        axisDominance: 0.4,
        strokeLengthImbalance: 0.1,
        elongationNorm: 0.18
      },
      semantic: {
        manifestation: "levitation",
        directionMode: "orientation",
        force: 0.12,
        focus: 0.02,
        spread: 0.08,
        range: 0.18,
        lifetimeBias: 0.28
      }
    },
    {
      id: "convergence",
      confidence: 0.93,
      neatness: 0.91,
      sizeNorm: 0.1,
      lengthNorm: 0.16,
      layer: "outer",
      radiusNorm: 0.78,
      angleDeg: 180,
      orientationDeg: 0,
      directedOrientationDeg: 0,
      radialFacing: "inward",
      shape: {
        axisDominance: 0.36,
        strokeLengthImbalance: 0.08,
        elongationNorm: 0.2
      },
      semantic: {
        manifestation: "convergence",
        directionMode: "inward",
        force: -0.04,
        focus: 0.26,
        spread: -0.22,
        range: -0.08
      }
    }
  ];

  const spellIR = compileSpell({
    glyphAST: glyphAST({
      ringComplete: true,
      element: "water",
      signs
    }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, true);
  assert.ok(spellIR.manifestations.levitation.strength > 0);
  assert.ok(spellIR.manifestations.convergence.strength > 0);
  assert.ok(spellIR.gravity < 1);
  assert.equal(typeof spellIR.manifestations.convergence.point!.x, "number");
  assert.equal(typeof spellIR.manifestations.convergence.point!.y, "number");
  assert.ok(spellIR.manifestations.convergence.radius! > 0);
});

test("represents a closed invalid ring without a duplicate IR state", () => {
  const spellIR = compileSpell({
    glyphAST: glyphAST({ ringComplete: true, primarySigil: false }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, false);
  assert.equal(spellIR.active, false);
  assert.equal(spellIR.prepared, false);
  assert.equal(Object.hasOwn(spellIR, "ringActivated"), false);
  assert.ok(spellIR.warnings.includes(GLYPH_WARNINGS.missingPrimarySigil));
});

test("rejects missing or unsupported primary elements", () => {
  const missingElement = compileSpell({
    glyphAST: glyphAST({ ringComplete: true, omitElement: true }),
    config: CONFIG
  });
  const unsupportedElement = compileSpell({
    glyphAST: glyphAST({ ringComplete: true, element: "moon" }),
    config: CONFIG
  });

  assert.equal(missingElement.valid, false);
  assert.equal(missingElement.active, false);
  assert.equal(missingElement.status, "Unsupported element");
  assert.ok(missingElement.warnings.includes(GLYPH_WARNINGS.primaryElementMissing));

  assert.equal(unsupportedElement.valid, false);
  assert.equal(unsupportedElement.active, false);
  assert.equal(unsupportedElement.status, "Unsupported element");
  assert.ok(unsupportedElement.warnings.includes(GLYPH_WARNINGS.primaryElementUnsupported));
});

test("rejects unsupported multiple rings", () => {
  const spellIR = compileSpell({
    glyphAST: glyphAST({
      unsupportedMultipleRings: [
        {
          center: { x: 620, y: 300 },
          radius: 120,
          complete: false,
          completeness: 0.86,
          strokeIds: ["s2"]
        }
      ]
    }),
    config: CONFIG
  });

  assert.equal(spellIR.valid, false);
  assert.equal(spellIR.active, false);
  assert.equal(spellIR.prepared, false);
  assert.equal(spellIR.status, "Multiple rings detected");
  assert.ok(spellIR.warnings.includes(GLYPH_WARNINGS.unsupportedMultipleRings));
});

test("rejects unsupported multiple sigils", () => {
  const spellIR = compileSpell({
    glyphAST: {
      ...glyphAST({ ringComplete: true }),
      unsupportedMultipleSigils: [
        {
          id: "water",
          kind: "sigil",
          confidence: 0.87,
          element: "water",
          strokeIds: ["s3"]
        }
      ]
    },
    config: CONFIG
  });

  assert.equal(spellIR.valid, false);
  assert.equal(spellIR.active, false);
  assert.equal(spellIR.prepared, false);
  assert.equal(spellIR.status, "Multiple sigils detected");
  assert.ok(spellIR.warnings.includes(GLYPH_WARNINGS.unsupportedMultipleSigils));
});
