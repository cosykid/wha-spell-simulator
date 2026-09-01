/**
 * @file The first-spell guide's script: which step of the walk the canvas is on,
 * and the words each step says. Pure functions of recognition signals, so the
 * whole walk is unit-testable without a canvas.
 *
 * The steps mirror how a spell is actually cast: draw an open ring, draw the
 * sigil in its center, then seal the gap. Sealing is the cast, so the walk has
 * no cast button to point at.
 */

/** The walk's stations, in casting order. */
export type FirstSpellStep = 'ring' | 'sigil' | 'seal' | 'cast';

/** What the guide reads off recognition to decide where the drawer is. */
export interface FirstSpellSignals {
	/** A ring (open or sealed) is detected on the canvas. */
	ringFound: boolean;
	/** The detected ring is topologically closed. */
	ringComplete: boolean;
	/** The compiler accepted a primary sigil (post-gate, not a raw candidate). */
	sigilRecognized: boolean;
	/** The compiled spell is active: sealed and valid, the cast is running. */
	active: boolean;
	/** The one-shot cast has finished playing. */
	castSpent: boolean;
	/** The ML refinement has landed, so the reading will not be overturned. */
	readingSettled: boolean;
	/** The compiler flagged the sigil as too low-confidence to count. */
	sigilUnclear: boolean;
}

const STEP_RANK: Record<FirstSpellStep, number> = { ring: 0, sigil: 1, seal: 2, cast: 3 };

/**
 * Resolves the walk step from the drawing's own state, so a drawer who skips
 * ahead (or undoes back) lands on the right instruction without the guide
 * keeping a cursor of its own.
 *
 * While a reading is unsettled the step never moves backward: the template
 * verdict on screen may be overturned by the ML pass moments later, and a
 * caption that regresses for one breath reads as scolding.
 */
export function resolveFirstSpellStep(
	signals: FirstSpellSignals,
	previous: FirstSpellStep | null = null
): FirstSpellStep {
	const step = rawStep(signals);
	if (previous && !signals.readingSettled && STEP_RANK[step] < STEP_RANK[previous]) {
		return previous;
	}
	return step;
}

function rawStep(signals: FirstSpellSignals): FirstSpellStep {
	if (signals.active || signals.castSpent) {
		return 'cast';
	}
	// A sealed-but-not-active ring still resolves by sigil presence: with one it
	// is the seal step mid-compile, without one it is the sigil step plus the
	// sealed-too-soon coaching below.
	if (signals.ringFound && signals.sigilRecognized && signals.readingSettled) {
		return 'seal';
	}
	if (signals.ringFound) {
		return 'sigil';
	}
	return 'ring';
}

/**
 * The gentle fix-it line under a caption, or null when the drawing is on
 * course. Only settled readings coach: a transient template verdict would
 * flash advice about a mistake the ML pass is about to un-make.
 */
export function firstSpellCoaching(signals: FirstSpellSignals): string | null {
	if (!signals.readingSettled) {
		return null;
	}
	if (signals.ringComplete && !signals.active && !signals.castSpent) {
		return 'The ring closed before the spell was ready. Press Undo and leave a small opening this time.';
	}
	if (signals.sigilUnclear) {
		return 'The sigil is not reading. Undo, then trace it larger and bolder.';
	}
	return null;
}

/** One station's words: an ordinal for the eyebrow, a title, and one instruction. */
export interface FirstSpellCaption {
	ordinal: string;
	title: string;
	body: string;
}

export const FIRST_SPELL_CAPTIONS: Record<FirstSpellStep, FirstSpellCaption> = {
	ring: {
		ordinal: 'Step 1 of 3',
		title: 'Draw the ring',
		body: 'Trace the faint circle, but stop short of closing it. An open ring holds the spell quiet while you work.'
	},
	sigil: {
		ordinal: 'Step 2 of 3',
		title: 'Draw the fire sigil',
		body: 'Trace the sigil in the middle of your ring. The sigil names what the spell calls, and this one calls fire.'
	},
	seal: {
		ordinal: 'Step 3 of 3',
		title: 'Seal the ring',
		body: 'Ready? Close the opening with one short stroke. The moment the circle completes, the spell wakes.'
	},
	cast: {
		ordinal: 'First spell',
		title: 'The spell awakens',
		body: 'The seal reads itself back, then the fire answers.'
	}
};

/** Steps that draw ghost ink on the paper. The cast keeps the frame for itself. */
export function stepHasGhost(step: FirstSpellStep): boolean {
	return step !== 'cast';
}

/** Steps that offer to place the practice spell for a struggling drawer. */
export function stepOffersPractice(step: FirstSpellStep): boolean {
	return step === 'ring' || step === 'sigil';
}
