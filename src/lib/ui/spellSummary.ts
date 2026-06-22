/**
 * Summary projection for the simulator control panel.
 *
 * The compiler and recognition pipeline expose detailed state, while the control
 * panel needs stable display fields: status text, lock state, meters, undo/redo
 * availability, and hint visibility. This module keeps that mapping pure and
 * testable.
 *
 * @packageDocumentation
 */
import { GLYPH_WARNINGS } from '../parser/glyphWarnings.js';
import { clamp } from '../utils/geometry.js';
import type { SpellIR, ClassifiedDrawing, StrokeStore } from '../types.js';

function spellStatusClass(
	spellIR: SpellIR | null | undefined,
	closedWithoutSpell: boolean,
	hasUnsupportedStructure: boolean
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
 * Maps a normalized meter value to a semantic display level.
 *
 * @param value - Normalized 0..1 meter value. Nullish values are treated as zero.
 * @returns The level used by control-panel meter styling.
 */
export function meterLevel(value: number | null | undefined): 'low' | 'medium' | 'high' {
	const normalized = clamp(value ?? 0);
	return normalized < 0.33 ? 'low' : normalized < 0.67 ? 'medium' : 'high';
}

/**
 * Formats a normalized meter value as a rounded percentage.
 *
 * @param value - Normalized 0..1 meter value. Nullish values are treated as zero.
 * @returns Percentage text for the control-panel meter readout.
 */
export function meterPercent(value: number | null | undefined): string {
	return `${Math.round(clamp(value ?? 0) * 100)}%`;
}

/**
 * Quantizes a normalized meter value into a count of filled pips, for the
 * diamond-pip meters in the minimal canvas chrome.
 *
 * @param value - Normalized 0..1 meter value. Nullish values are treated as zero.
 * @param total - Number of pips in the row.
 * @returns How many of the `total` pips should render filled (0..total).
 */
export function meterPips(value: number | null | undefined, total = 10): number {
	return Math.round(clamp(value ?? 0) * total);
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

	const statusText = hasUnsupportedMultipleRings
		? 'Multiple rings detected - undo or clear'
		: hasUnsupportedMultipleSigils
			? 'Multiple sigils detected - undo or clear'
			: closedWithoutSpell
				? closedWithoutSpellStatus(spellIR)
				: (spellIR?.status ?? 'No ring detected');

	// The canvas shows its sealed/locked styling only for finished spells, while arrange
	// mode locks freehand capture without that styling so shapes can still be edited.
	const canvasLocked = ringClosed || hasUnsupportedStructure;
	// Erase mode locks freehand capture the same way arrange mode does; the
	// eraser itself stays usable even when the canvas is sealed.
	const inputLocked = canvasLocked || arrangeMode || eraseMode;

	return {
		statusText,
		statusClass: spellStatusClass(spellIR, closedWithoutSpell, hasUnsupportedStructure),
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
