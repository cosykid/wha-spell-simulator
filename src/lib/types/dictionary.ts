// Dictionary entries (sigils & signs), their templates, and matching results.

import type { Point } from './geometry.js';

export type Layer = 'center' | 'middle' | 'outer';
export type LayerOrAny = Layer | 'any' | 'outside' | 'ringBoundary';
export type ElementId = 'fire' | 'water' | 'wind' | 'earth' | 'light';
export type RadialFacing = 'outward' | 'inward' | 'clockwise' | 'counterclockwise' | 'unclear';

export interface StrokeTemplate {
	sourceAspectRatio: number;
	strokes: Point[][];
}

export interface Semantic {
	manifestation?: string;
	directionMode?: 'orientation' | 'inward' | 'position' | string;
	force?: number;
	focus?: number;
	spread?: number;
	range?: number;
	lifetimeBias?: number;
}

/**
 * The glyph's "regular" footprint as a fraction of the ring diameter, i.e. the
 * ring-relative `sizeNorm` a normally-drawn instance occupies. Dividing the drawn
 * `sizeNorm` by this gives a glyph-relative `sizeRatio` (1 = regular), which the
 * compiler turns into effect scale and strength and the diagnostics overlay shows
 * as `×ratio weak/regular/strong`. Omitted entries fall back to
 * `renderer.effectSize.defaultReferenceSizeNorm`. Applies to both sigils and signs.
 */
type ReferenceSizeNorm = number;

export interface SigilEntry {
	id: string;
	displayName: string;
	/** Optional JSON-side note for exceptional per-entry context. Ignored at runtime. */
	$comment?: string;
	element?: ElementId;
	allowedLayers?: string[];
	sourceNotes?: string;
	strokeTemplate?: StrokeTemplate;
	recognitionRotationInvariant?: boolean;
	allowedRotationsDeg?: number[];
	semantic?: Semantic;
	referenceSizeNorm?: ReferenceSizeNorm;
}

export interface SignEntry {
	id: string;
	displayName: string;
	/** Optional JSON-side note for exceptional per-entry context. Ignored at runtime. */
	$comment?: string;
	/** Signs carry no element; declared so the dictionary-entry union stays uniform. */
	element?: undefined;
	allowedLayers?: string[];
	sourceNotes?: string;
	semantic?: Semantic;
	strokeTemplate?: StrokeTemplate;
	recognitionRotationInvariant?: boolean;
	allowedRotationsDeg?: number[];
	referenceSizeNorm?: ReferenceSizeNorm;
}

/** Options controlling how a candidate is rotated while template matching. */
export interface TemplateMatchOptions {
	rotationInvariant?: boolean;
	allowedRotationsDeg?: number[];
}

/** The ink/region overlap result of matching a candidate against a template. */
export interface TemplateMatch {
	available: boolean;
	confidence: number;
	rotationDeg: number;
	recognitionRotationDeg: number;
	$pDistance?: number;
	pScore?: number;
	chamferDistance?: number;
	chamferScore?: number;
	inkScore: number;
	softDiceScore: number;
	candidateExplainedRatio: number;
	templateCoveredRatio: number;
	unexplainedInkRatio: number;
	missingInkRatio: number;
	contaminationRisk: number;
	requiredCellCoverage: number;
	forbiddenCellInkRatio: number;
	regionScore: number;
}

export type DictionaryEntry = SigilEntry | SignEntry;

export interface SampleSpell {
	id: string;
	displayName: string;
	description?: string;
	element?: ElementId;
	manifestations?: string[];
	strokes: Point[][];
}

export interface Dictionary {
	sigils: SigilEntry[];
	signs: SignEntry[];
	sampleSpells?: SampleSpell[];
}
