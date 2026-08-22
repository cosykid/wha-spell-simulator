export const CONFIG = {
	// String version tag shown in diagnostics.
	appVersion: '0.1.0-poc',
	input: {
		// Canvas pixels; lower keeps more pointer samples, higher smooths noisy input.
		minPointDistance: 1.4,

		// Canvas pixels; strokes shorter than this are ignored.
		minStrokeLength: 7,

		// Integer passes, usually 0..3; set to 0 to use raw points.
		// Higher softens hand jitter but can distort sharp symbols.
		smoothingPasses: 1
	},
	eraser: {
		// Canvas pixels; eraser brush radius.
		radius: 10,

		// Canvas pixels; surviving stroke fragments shorter than this are dropped
		// (matches input.minStrokeLength so remnants stay recognizable ink).
		minRemnantLength: 7
	},
	ring: {
		// Canvas pixels; smallest ring radius accepted as spell paper boundary.
		minRadius: 70
	},
	// spell ring layer (three layers); sigils are usually in the center layer
	layers: {
		// 0..1 normalized radius; center symbol area.
		centerMax: 0.32,

		// 0..1 normalized radius; middle symbol area.
		middleMax: 0.66,

		// 0..1 normalized radius; outer sign area.
		outerMax: 0.94,

		// 0..1 normalized radius; strokes beyond this are outside the spell boundary.
		boundaryMax: 1.06,

		// 0..1 normalized radius; marks symbols close to layer edges as ambiguous.
		boundaryTolerance: 0.055
	},
	recognition: {
		// 0..1 final recognizer score floor.
		minConfidence: 0.48,

		// 0..1 value subtracted per group when decomposition scores a tree cut. This
		// biases toward keeping a node whole; a split only wins when the child groups
		// clearly outscore the whole. Must sit below the shape-match confidence that
		// real hand-drawn symbols reach (roughly 0.55-0.75); a higher value zeroes
		// every group and the cut degenerates to touch-based merging, which fuses
		// adjacent symbols. Tuned so complex multi-stroke sigils and signs (water,
		// wind, light, levitation) stay whole while genuinely separate symbols
		// (a center sigil beside a ring sign, two adjacent signs) split apart.
		groupPenalty: 0.55,

		// 0..1 allowed extra ink before a match is considered contaminated.
		contaminationThreshold: 0.5,

		// 0..1 required template coverage before a match can be accepted.
		minTemplateCoverage: 0.55,

		// Grouping asks the recognizer to choose tree cuts so it can separate symbols
		// that proximity grouping would fuse (for example a center sigil drawn next to
		// a ring sign). The lightweight cut scorer and the groupPenalty above keep
		// complex multi-stroke sigils and signs whole. Set false to fall back to plain
		// whole-stroke proximity-connected-component grouping.
		recognitionGuidedDecomposition: true,

		ml: {
			// Hybrid recognizer: the template recognizer still runs first. When a browser
			// ONNX model is available, ML can reinforce/override template results. Unknown
			// template results need a loose glyph-like verifier signal unless the ML
			// prediction clears the super-confident thresholds below.
			enabled: true,
			modelUrl: '/models/glyph-recognizer.onnx',
			classMapUrl: '/models/glyph-class-to-idx.json',
			inputSize: 96,
			margin: 0.2,
			strokeWidth: 2,
			acceptConfidence: 0.74,
			acceptMargin: 0.16,
			overrideConfidence: 0.84,
			overrideMargin: 0.18,
			superConfidence: 0.94,
			superMargin: 0.28,
			debug: false
		}
	},
	compiler: {
		// 0..1 confidence; minimum primary sigil confidence before a spell is valid.
		minimumPrimarySigilConfidence: 0.62,

		// Count; unknown symbols above this increase instability.
		maxUnknownsBeforeInstability: 4
	},
	renderer: {
		// CSS color; drawn ink color.
		inkColor: '#241b16',

		// CSS color; guide line color.
		guideColor: 'rgba(92, 74, 54, 0.28)',

		effectSize: {
			// Ring-fraction footprint treated as a sigil's "regular" size when its
			// dictionary entry does not declare a `referenceSizeNorm`. The compiler
			// computes sizeRatio = primary.sizeNorm / referenceSizeNorm (1 = regular).
			defaultReferenceSizeNorm: 0.3,

			// 0..1+ multiplier; effect scale rendered for a regular-size sigil (sizeRatio === 1).
			neutralScale: 1.91,

			// Effect-scale change per unit of sizeRatio away from regular size; larger
			// sigils produce larger effects, smaller ones produce smaller effects.
			sizeRatioInfluence: 0.63,

			// sizeRatio that reads as full strength (1.0). A regular-size sigil
			// (ratio 1) therefore reads as 1 / strengthFullSizeRatio.
			strengthFullSizeRatio: 2,

			// 0..1+ multiplier; lower visual effect scale clamp.
			minScale: 1,

			// 0..1+ multiplier; upper visual effect scale clamp.
			maxScale: 2.35
		}
	}
};

export type AppConfig = typeof CONFIG;
