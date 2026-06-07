/**
 * Types for a labelled handwriting sample: the raw strokes a contributor drew
 * (the *data*) together with the sign/sigil they represent and its measured
 * scaling/orientation (the *label*).
 *
 * Design principles:
 *  - Strokes are stored RAW. No geometric normalization is applied at capture
 *    time — normalize in a documented preprocessing step instead, so the
 *    convention can change without invalidating stored data.
 *  - Enough metadata is captured to fully reconstruct the sample even if
 *    conventions later change (reference size, canvas size, DPI, schema version).
 */

/**
 * One captured pointer sample. Coordinates are in the same coordinate frame
 * strokes are recorded in: CSS pixels relative to the canvas bounding rect.
 */
export type Point = {
	/** CSS px, relative to canvas top-left. */
	x: number;
	/** CSS px, relative to canvas top-left. */
	y: number;
	/** ms since the first point of the FIRST stroke (t0 = 0). */
	t: number;
	/** [0,1] if the device reports it (pen); otherwise omitted. */
	pressure?: number;
};

/** A single pen-down → pen-up trace. */
export type Stroke = Point[];

/**
 * Whether an orientation angle is meaningful for this glyph.
 * Drives both the labelling UI and benchmark scoring (symmetry handling).
 * See: https://witchhatatelier.telepedia.net/wiki/Signs_Explained#Directional_Signs
 */
export type Directionality = 'directional' | 'non-directional' | 'semi-directional';

/**
 * The human-asserted ground truth. Produced by dragging/resizing/rotating the
 * reference SVG over the strokes — so it is a noisy, by-eye label.
 */
export type Label = {
	/** Which ground-truth glyph this sample represents. */
	signId: string;

	directionality: Directionality;

	/**
	 * Anisotropic scale relative to the reference rendering:
	 *   scale = renderedSizePx / referenceSizePx
	 * 1.0 means the user's drawing matches the reference size on that axis.
	 */
	scale_x: number;
	scale_y: number;

	/**
	 * Orientation in radians, range (-π, π].
	 *  - number → meaningful angle (directional, or a labelled semi-directional)
	 *  - null   → angle is not defined for this glyph (non-directional)
	 * Always present; `null` ("no angle exists") is distinct from the field being
	 * absent ("not yet labelled").
	 */
	angle: number | null;
};

/**
 * Everything needed to reconstruct the sample even if conventions change.
 * Captured cheaply at submission time; most of it cannot be recovered later.
 */
export type SampleMeta = {
	/** Bump when the schema or normalization/label conventions change. */
	schemaVersion: number;

	/** Pixels the reference SVG viewBox spanned at "scale 1". Unit for scale_*. */
	referenceSize: number;

	/** Canvas size in CSS px — the frame the raw coordinates live in. */
	canvasWidth: number;
	canvasHeight: number;

	/** Physical-pixel ratio at capture time (for DPI-independent processing). */
	devicePixelRatio: number;

	/** Discriminative signal, also useful for abuse filtering. */
	pointerType: 'pen' | 'touch' | 'mouse' | 'unknown';

	/** ISO 8601 timestamp of capture. */
	capturedAt: string;
	/** Anonymous session grouping, for the review / anti-bot pipeline. */
	sessionId?: string;
	/** Contributor attribution, if accounts exist. */
	contributorId?: string;
};

/**
 * What the browser sends to the backend. The server assigns `id` and is the
 * authority on `capturedAt`, so neither is set client-side.
 */
export type SampleSubmission = {
	data: Stroke[];
	label: Label;
	meta: Omit<SampleMeta, 'capturedAt'>;
};

/** The complete unit stored in the database. */
export type LabelledSample = {
	/** Server-assigned identifier. */
	id: string;
	data: Stroke[];
	label: Label;
	meta: SampleMeta;
};

/** Current schema version. Bump alongside any breaking convention change. */
export const SAMPLE_SCHEMA_VERSION = 1;
