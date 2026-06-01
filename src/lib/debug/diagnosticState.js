import { formatNumber } from "../utils/geometry.js";

function roundForDisplay(value) {
  if (Array.isArray(value)) {
    return value.map(roundForDisplay);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundForDisplay(item)]));
  }
  return formatNumber(value);
}

export function buildDiagnosticState({ rawStrokes, pipeline, spellIR }) {
  return roundForDisplay({
    rawStrokes: {
      strokeCount: rawStrokes.length,
      pointCount: rawStrokes.reduce((sum, stroke) => sum + stroke.points.length, 0),
      drawOrder: rawStrokes.map((stroke) => stroke.id)
    },
    ring: pipeline?.glyphAST?.ring ?? null,
    classifications: pipeline?.classifications ?? [],
    candidates: (pipeline?.candidates ?? []).map((candidate) => {
      const { strokes, ...publicCandidate } = candidate;
      return publicCandidate;
    }),
    recognitions: pipeline?.recognitions ?? [],
    glyphAST: pipeline?.glyphAST ?? null,
    spellIR
  });
}
