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
	if (warnings.includes(GLYPH_WARNINGS.unsupportedMultipleRings)) {
		return 'Multiple rings detected - undo or clear';
	}
	if (warnings.includes(GLYPH_WARNINGS.unsupportedMultipleSigils)) {
		return 'Multiple sigils detected - undo or clear';
	}
	if (
		warnings.includes(GLYPH_WARNINGS.primaryElementMissing) ||
		warnings.includes(GLYPH_WARNINGS.primaryElementUnsupported)
	) {
		return 'Ring closed - unsupported element';
	}
	if (warnings.includes(GLYPH_WARNINGS.symbolContaminated)) {
		return 'Ring closed - contaminated sigil';
	}
	if (warnings.includes(GLYPH_WARNINGS.symbolAmbiguous)) {
		return 'Ring closed - ambiguous sigil';
	}
	if (warnings.includes(GLYPH_WARNINGS.primarySigilAmbiguous)) {
		return 'Ring closed - ambiguous sigil';
	}
	if (warnings.includes(GLYPH_WARNINGS.primarySigilConfidenceLow)) {
		return 'Ring closed - unstable sigil';
	}
	return 'Ring closed - no stable magic detected';
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

/** Maps a normalized 0..1 meter value to a low/medium/high level. */
export function meterLevel(value: number | null | undefined): 'low' | 'medium' | 'high' {
	const normalized = clamp(value ?? 0);
	return normalized < 0.33 ? 'low' : normalized < 0.67 ? 'medium' : 'high';
}

/** Formats a normalized 0..1 value as a rounded percentage string. */
export function meterPercent(value: number | null | undefined): string {
	return `${Math.round(clamp(value ?? 0) * 100)}%`;
}

/**
 * Derives the spell-state summary shown in the control panel from the current
 * pipeline / IR. Returns plain data so the UI can render it reactively.
 */
export function computeSummary({
	store,
	pipeline,
	spellIR,
	showGuides
}: {
	store: StrokeStore;
	pipeline: ClassifiedDrawing | null | undefined;
	spellIR: SpellIR | null | undefined;
	showGuides: boolean;
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

	const inputLocked = ringClosed || hasUnsupportedStructure;

  return {
    statusText,
    statusClass: spellStatusClass(spellIR, closedWithoutSpell, hasUnsupportedStructure),
    element: spellIR?.element ? spellIR.element : "None",
    manifestation: formatManifestations(spellIR),
    quality: clamp(spellIR?.quality ?? 0),
    stability: clamp(spellIR?.stability ?? 0),
    force: clamp(spellIR?.force ?? 0),
    inputLocked,
    undoDisabled: undoLocked || store.count() === 0,
    redoDisabled: undoLocked || !store.canRedo(),
    portalActive: Boolean(spellIR?.active),
    hintHidden: store.count() > 0 || !showGuides
  };
}

/** The summary shown before the dictionary has loaded. */
export const INITIAL_SUMMARY = {
  statusText: "Loading",
  statusClass: "",
  element: "None",
  manifestation: "None",
  quality: 0,
  stability: 0,
  force: 0,
  inputLocked: false,
  undoDisabled: true,
  redoDisabled: true,
  portalActive: false,
  hintHidden: false
};
