/**
 * @file A labelled handwriting sample, to be used for training/testing the recognition of a single sign/sigil. Includes raw stroke data + the human-asserted label (class of sign, scaling, orientation).
 *
 * All coordinates are relative to the canvas top-left. The canvas size is stored in
 * `meta.canvasWidth/Height`. To see the math for converting from event coordinates
 * to this frame, see `canvasPointFromEvent` in `pointerNormalizer.ts`.
 *
 * Strokes are stored RAW, along with enough metadata to fully reconstruct the sample
 * even if conventions later change.
 *
 * The schema is also versioned to allow for breaking changes in the future.
 */

/**
 * One captured pointer sample.
 */
export type Point = {
	/** Backing-store px, relative to canvas top-left. */
	x: number;
	/** Backing-store px, relative to canvas top-left. */
	y: number;
	/** ms since the first point of the FIRST stroke (t0 = 0). */
	t: number;
};

/**
 * A single pen-down → pen-up trace. Points are grouped per stroke (each stroke is
 * its own array) so every point stays associated with the stroke it belongs to.
 */
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
	 * Position of the reference glyph's center, in the same coordinate frame as the strokes. This is an absolute position, not a ratio.
	 */
	translate_x: number;
	translate_y: number;

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
	/** Pixels the reference SVG viewBox spanned at "scale 1". Unit for scale_*. */
	referenceSize: number;

	/** Canvas size in backing-store px — the frame the raw coordinates live in. */
	canvasWidth: number;
	canvasHeight: number;

	/** Physical-pixel ratio at capture time (for DPI-independent processing). */
	devicePixelRatio: number;

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
