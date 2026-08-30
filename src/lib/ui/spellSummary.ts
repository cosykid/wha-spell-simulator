/**
 * Summary projection for the simulator control panel.
 *
 * The compiler and recognition pipeline expose detailed state, while the control
 * panel needs stable display fields: status text, lock state, meters, undo/redo
 * availability, hint visibility, and when the running cast ends. This module
 * keeps that mapping pure and testable.
 *
 * @packageDocumentation
 */
import { totalMsFor } from '../cast/score/beats.js';
import { GLYPH_WARNINGS } from '../parser/glyphWarnings.js';
import { clamp } from '../utils/geometry.js';
import type { SpellIR, ClassifiedDrawing, StrokeStore } from '../types.js';

function spellStatusClass(
	spellIR: SpellIR | null | undefined,
	closedWithoutSpell: boolean,
	hasUnsupportedStructure: boolean,
	inProgress: boolean
): string {
	if (hasUnsupportedStructure) {
		return 'invalid';
	}
	if (spellIR?.active) {
		return 'active';
	}
	if (spellIR?.prepared) {
		return 'prepared';
	}
	if (closedWithoutSpell && spellIR?.warnings?.includes(GLYPH_WARNINGS.missingPrimarySigil)) {
		return 'closed';
	}
	// An unfinished open ring is the expected first step, so it takes the neutral
	// dot rather than the alarming one the compiler's verdict would give it.
	if (inProgress) {
		return '';
	}
	return spellIR?.valid ? '' : 'invalid';
}

function closedWithoutSpellStatus(spellIR: SpellIR | null | undefined): string {
	const warnings = spellIR?.warnings ?? [];

	for (const { matchingWarnings, status } of CLOSED_WITHOUT_SPELL_STATUSES) {
		if (matchingWarnings.some((warning) => warnings.includes(warning))) {
			return status;
		}
	}
	return 'Ring closed - no stable magic detected';
}

const CLOSED_WITHOUT_SPELL_STATUSES = [
	{
		matchingWarnings: [GLYPH_WARNINGS.unsupportedMultipleRings],
		status: 'Multiple rings detected - undo or clear'
	},
	{
		matchingWarnings: [GLYPH_WARNINGS.unsupportedMultipleSigils],
		status: 'Multiple sigils detected - undo or clear'
	},
	{
		matchingWarnings: [
			GLYPH_WARNINGS.primaryElementMissing,
			GLYPH_WARNINGS.primaryElementUnsupported
		],
		status: 'Ring closed - unsupported element'
	},
	{
		matchingWarnings: [GLYPH_WARNINGS.symbolContaminated],
		status: 'Ring closed - contaminated sigil'
	},
	{
		matchingWarnings: [GLYPH_WARNINGS.symbolAmbiguous, GLYPH_WARNINGS.primarySigilAmbiguous],
		status: 'Ring closed - ambiguous sigil'
	},
	{
		matchingWarnings: [GLYPH_WARNINGS.primarySigilConfidenceLow],
		status: 'Ring closed - unstable sigil'
	}
] as const;

/**
 * Names the next step for an open ring the compiler has rejected, or null when
 * the drawing is not in that state.
 *
 * A ring with no readable sigil compiles to an invalid spell, but drawing the
 * ring before its sigil is the intended order. While the ring is still open that
 * verdict describes work in progress, so the panel asks for the missing piece
 * instead of reporting a failure. A closed ring keeps the compiler's verdict.
 */
function inProgressStatus(spellIR: SpellIR | null | undefined, ringClosed: boolean): string | null {
	if (ringClosed || spellIR?.valid !== false) {
		return null;
	}

	const warnings = spellIR.warnings ?? [];
	for (const { matchingWarnings, status } of IN_PROGRESS_STATUSES) {
		if (matchingWarnings.some((warning) => warnings.includes(warning))) {
			return status;
		}
	}
	return null;
}

const IN_PROGRESS_STATUSES = [
	{
		matchingWarnings: [GLYPH_WARNINGS.missingPrimarySigil],
		status: 'Ring open - draw a sigil in the center'
	},
	{
		matchingWarnings: [GLYPH_WARNINGS.primarySigilConfidenceLow],
		status: 'Sigil unclear - try drawing it larger'
	}
] as const;

/**
 * When the running one-shot cast finishes, on the `performance.now()` clock that
 * `activatedAt` is stamped from. Null unless a cast is running.
 */
function castEndsAtFor(spellIR: SpellIR | null | undefined): number | null {
	const activatedAt = spellIR?.activatedAt;
	if (!spellIR?.active || typeof activatedAt !== 'number') {
		return null;
	}
	const endsAt = activatedAt + totalMsFor(spellIR.duration);
	return Number.isFinite(endsAt) ? endsAt : null;
}

function formatManifestations(spellIR: SpellIR | null | undefined): string {
	const manifestations = Object.entries(spellIR?.manifestations ?? {}).filter(
		([, manifestation]) => (manifestation?.strength ?? 0) > 0
	);
	if (!manifestations.length || spellIR?.primaryManifestation === 'none') {
		return 'None';
	}

	return manifestations.map(([id]) => id).join(', ');
}

/**
 * Derives the control-panel summary from the current drawing and spell state.
 *
 * The returned object is deliberately plain data so Svelte components can render
 * it reactively without depending on parser/compiler internals.
 *
 * @param input - Current stores, recognition result, compiled spell IR, display toggles, and history state.
 * @returns Display-ready spell summary for the simulator controls and canvas chrome.
 */
export function computeSummary({
	store,
	pipeline,
	spellIR,
	showGuides,
	arrangeMode = false,
	eraseMode = false,
	placementCount = 0,
	hintDismissed = false,
	canUndo,
	canRedo
}: {
	store: StrokeStore;
	pipeline: ClassifiedDrawing | null | undefined;
	spellIR: SpellIR | null | undefined;
	showGuides: boolean;
	arrangeMode?: boolean;
	eraseMode?: boolean;
	placementCount?: number;
	hintDismissed?: boolean;
	canUndo?: boolean;
	canRedo?: boolean;
}) {
	const ringClosed = Boolean(pipeline?.ring?.complete);
	const hasUnsupportedMultipleRings = Boolean(pipeline?.ring?.unsupportedMultipleRings?.length);
	const hasUnsupportedMultipleSigils = Boolean(
		pipeline?.glyphAST?.unsupportedMultipleSigils?.length
	);
	const hasUnsupportedStructure = hasUnsupportedMultipleRings || hasUnsupportedMultipleSigils;
	const closedWithoutSpell = ringClosed && !spellIR?.active;
	const inProgressText = inProgressStatus(spellIR, ringClosed);

	const statusText = hasUnsupportedMultipleRings
		? 'Multiple rings detected - undo or clear'
		: hasUnsupportedMultipleSigils
			? 'Multiple sigils detected - undo or clear'
			: closedWithoutSpell
				? closedWithoutSpellStatus(spellIR)
				: (inProgressText ?? spellIR?.status ?? 'No ring detected');

	// The canvas shows its sealed/locked styling only for finished spells, while arrange
	// mode locks freehand capture without that styling so shapes can still be edited.
	const canvasLocked = ringClosed || hasUnsupportedStructure;
	// Erase mode locks freehand capture the same way arrange mode does; the
	// eraser itself stays usable even when the canvas is sealed.
	const inputLocked = canvasLocked || arrangeMode || eraseMode;

	return {
		statusText,
		statusClass: spellStatusClass(
			spellIR,
			closedWithoutSpell,
			hasUnsupportedStructure,
			inProgressText !== null
		),
		castEndsAt: castEndsAtFor(spellIR),
		element: spellIR?.element ? spellIR.element : 'None',
		manifestation: formatManifestations(spellIR),
		quality: clamp(spellIR?.quality ?? 0),
		stability: clamp(spellIR?.stability ?? 0),
		force: clamp(spellIR?.force ?? 0),
		inputLocked,
		canvasLocked,
		// Undo/redo availability comes from the unified history when the caller
		// tracks it (strokes + placements); otherwise fall back to the stroke
		// store so consumers without placements still get correct button states.
		undoDisabled: canUndo === undefined ? store.count() === 0 : !canUndo,
		redoDisabled: Boolean(spellIR?.active) || (canRedo === undefined ? !store.canRedo() : !canRedo),
		portalActive: Boolean(spellIR?.active),
		hintHidden: hintDismissed || store.count() > 0 || placementCount > 0 || !showGuides
	};
}

/**
 * Summary shown before the dictionary and recognition pipeline have loaded.
 */
export const INITIAL_SUMMARY = {
	statusText: 'Loading',
	statusClass: '',
	castEndsAt: null as number | null,
	element: 'None',
	manifestation: 'None',
	quality: 0,
	stability: 0,
	force: 0,
	inputLocked: false,
	canvasLocked: false,
	undoDisabled: true,
	redoDisabled: true,
	portalActive: false,
	hintHidden: false
};

/**
 * Display contract consumed by the control panel and canvas chrome.
 */
export type SpellSummary = typeof INITIAL_SUMMARY;
