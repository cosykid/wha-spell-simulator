// Shared domain types for the spell simulator pipeline.
//
// The pipeline flows: raw pointer input -> strokes -> ring detection ->
// symbol candidates -> recognition -> GlyphAST -> compiled SpellIR -> rendered
// effect. Many intermediate objects are built dynamically, so several of the
// pipeline interfaces below keep fields optional and lean on structural typing.

export type { AppConfig } from './config.js';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Vector {
	x: number;
	y: number;
}

export interface Point extends Vector {
	pressure?: number;
	t?: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export interface StrokeMetrics {
	length: number;
	bounds: Bounds;
	pointCount: number;
}

export interface Stroke {
	id: string;
	points: Point[];
	startedAt?: number;
	endedAt?: number;
	metrics?: StrokeMetrics;
}

/** A stroke after `cleanStrokes` has attached geometry metrics. */
export interface CleanedStroke extends Stroke {
	metrics: StrokeMetrics;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

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

export interface SigilEntry {
	id: string;
	displayName: string;
	element?: ElementId;
	allowedLayers?: string[];
	sourceNotes?: string;
	strokeTemplate?: StrokeTemplate;
	recognitionRotationInvariant?: boolean;
	allowedRotationsDeg?: number[];
	semantic?: Semantic;
}

export interface SignEntry {
	id: string;
	displayName: string;
	/** Signs carry no element; declared so the dictionary-entry union stays uniform. */
	element?: undefined;
	allowedLayers?: string[];
	sourceNotes?: string;
	semantic?: Semantic;
	strokeTemplate?: StrokeTemplate;
	recognitionRotationInvariant?: boolean;
	allowedRotationsDeg?: number[];
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
	knnVoteConfidence?: number;
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

// ---------------------------------------------------------------------------
// Ring detection
// ---------------------------------------------------------------------------

export interface RingGap {
	startAngle: number;
	endAngle: number;
	sizeDegrees: number;
}

export interface UnsupportedRing {
	center: Vector;
	radius: number;
	complete?: boolean;
	completeness?: number;
	strokeIds?: string[];
}

export interface RingInfo {
	found: boolean;
	complete?: boolean;
	completeness?: number;
	activationEvent?: boolean;
	center: Vector;
	radius: number;
	radiusNorm?: number;
	coverageRatio?: number;
	gap?: RingGap;
	gapArcLength?: number;
	roundness?: number;
	lineSmoothness?: number;
	neatness?: number;
	overdrawAmount?: number;
	strokeIds?: string[];
	score?: number;
	unsupportedNestedRings?: UnsupportedRing[];
	unsupportedMultipleRings?: UnsupportedRing[];
}

// ---------------------------------------------------------------------------
// Candidates & recognition
// ---------------------------------------------------------------------------

export type RecognitionKind = 'sigil' | 'sign' | 'unknown';

export type RecognitionStatus = 'valid' | 'valid_messy' | 'ambiguous' | 'contaminated' | 'unknown';

/** A grouped set of strokes that may correspond to a dictionary symbol. */
export interface SymbolCandidate {
	candidateId: string;
	strokeIds: string[];
	rawStrokeCount: number;
	cleanedStrokeCount?: number;
	bounds: Bounds;
	center: Vector;
	radiusNorm: number;
	angleDeg: number;
	layer: LayerOrAny;
	nearBoundary: boolean;
	sizeNorm: number;
	lengthNorm: number;
	orientationDeg: number;
	directedOrientationDeg: number;
	radialFacing: RadialFacing;
	closedness?: number;
	overdrawAmount: number;
	neatness: number;
	strokes: Stroke[];
}

export interface TopMatch {
	kind: RecognitionKind;
	id: string;
	confidence: number;
	templateConfidence?: number;
	$pDistance?: number;
	chamferDistance?: number;
	knnVoteConfidence?: number;
	inkScore?: number;
	candidateExplainedRatio?: number;
	templateCoveredRatio?: number;
	structuralScore?: number;
	aspectScore?: number;
	strokeCountScore?: number;
	strokeProfileScore?: number;
	rotationDeg?: number;
	recognitionRotationDeg?: number;
}

export interface RecognitionBestGuess {
	kind: RecognitionKind;
	id: string;
	confidence: number;
}

export interface RecognitionDiagnostics {
	bestGuess?: RecognitionBestGuess | null;
	recognitionRotationDeg: number;
	template: Record<string, number>;
	matcher?: {
		$pDistance: number;
		chamferDistance: number;
		knnVoteConfidence: number;
		knnVotes: Record<string, number>;
		nearestExamples: Array<{
			id: string;
			kind: RecognitionKind;
			symbolId: string;
			source: string;
			distance: number;
			$pDistance: number;
			chamferDistance: number;
		}>;
		candidateExplainedRatio: number;
		templateCoveredRatio: number;
		unexplainedInkRatio: number;
	};
	structure: Record<string, number>;
	topMatches: TopMatch[];
}

/** The result of scoring a candidate against the dictionary. */
export interface Recognition {
	candidateId: string;
	strokeIds: string[];
	layer: LayerOrAny;
	nearBoundary: boolean;
	radiusNorm: number;
	angleDeg: number;
	sizeNorm: number;
	lengthNorm: number;
	orientationDeg: number;
	directedOrientationDeg: number;
	radialFacing: RadialFacing;
	overdrawAmount: number;
	neatness: number;
	recognized: boolean;
	recognitionStatus: RecognitionStatus;
	kind: RecognitionKind;
	id: string | null;
	displayName: string | null;
	element: ElementId | null;
	semantic: Semantic | null;
	confidence: number;
	shape?: Record<string, number>;
	diagnostics?: RecognitionDiagnostics | null;
}

/** A recognition produced by `recognizeCandidates`, where diagnostics and shape are always populated. */
export interface RecognizedSymbol extends Recognition {
	shape: Record<string, number>;
	diagnostics: RecognitionDiagnostics;
}

// ---------------------------------------------------------------------------
// GlyphAST (parser output)
// ---------------------------------------------------------------------------

export interface GlobalMetrics {
	neatness: number;
	radialSymmetry: number;
	instability: number;
}

export interface GlyphAST {
	type: 'GlyphAST';
	version?: string;
	ring: RingInfo;
	candidates?: unknown[];
	primarySigil: Recognition | null;
	unsupportedMultipleSigils?: unknown[];
	signs: Recognition[];
	unknowns: unknown[];
	globalMetrics: GlobalMetrics;
	warnings: string[];
}

export interface ClassifiedDrawing {
	cleanedStrokes: Stroke[];
	ring: RingInfo;
	classifications: unknown[];
	candidates: SymbolCandidate[];
	recognitions: Recognition[];
	glyphAST: GlyphAST;
}

// ---------------------------------------------------------------------------
// SpellIR (compiler output)
// ---------------------------------------------------------------------------

export interface SpellDirection {
	x: number;
	y: number;
	z: number;
	xTiltDeg: number;
	yTiltDeg: number;
	tiltFromZDeg: number;
}

export interface Manifestation {
	strength: number;
	point?: Vector;
	radius?: number;
	rigidity?: number;
}

export interface SemanticDeltas {
	force: number;
	focus: number;
	spread: number;
	range: number;
	lifetimeBias: number;
}

export interface SpellIR {
	type: 'SpellIR';
	active: boolean;
	prepared: boolean;
	valid: boolean;
	status: string;
	activatedAt: number | null;
	element: ElementId | null;
	/** The id of the primary sigil, so effects can vary by element-variant sigils (e.g. crystal, aeriform). */
	sigil: string | null;
	elementConfidence: number;
	primarySizeNorm: number;
	effectScale: number;
	primaryManifestation: string;
	manifestations: Record<string, Manifestation>;
	direction: SpellDirection;
	directionCoherence: number;
	gravity: number;
	force: number;
	spread: number;
	focus: number;
	range: number;
	duration: number;
	stability: number;
	quality: number;
	neatness: number;
	warnings: string[];
	signature: string;
}

// ---------------------------------------------------------------------------
// Input capture
// ---------------------------------------------------------------------------

export interface DrawingCaptureCallbacks {
	onPreview?: (stroke: Stroke | null) => void;
	onCommit?: () => void;
}

export interface StrokeStore {
	addStroke(points: Point[]): Stroke;
	undo(): Stroke | null;
	redo(): Stroke | null;
	clear(): void;
	scale(scaleX: number, scaleY: number): void;
	getStrokes(): Stroke[];
	count(): number;
	canRedo(): boolean;
}
