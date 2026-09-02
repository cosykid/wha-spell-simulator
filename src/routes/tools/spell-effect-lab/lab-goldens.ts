/**
 * @file Test-only hook for the look golden tier. `?preset=<id>&frameMs=<n>`
 * loads a lab preset and steps the preview to a fixed timestamp with a fixed
 * step, instead of following the animation clock, so a Playwright screenshot
 * lands on the same frame every run. `&sigil=<id>` picks which look row it paints
 * from, which is how the crystal and aeroform rows get a baseline.
 *
 * Nothing in the app links here. Both parameters are required together, so a
 * deep link that names only a preset still lands on the live clock. See
 * `tests-e2e/golden-look.e2e.ts`.
 */

import { DEFAULT_SIGIL, SIGIL_OPTIONS } from '$lib/ui/spellEffectLab.js';

/** Step the scripted clock advances by, matching a 60fps frame. */
export const GOLDEN_FRAME_STEP_MS = 1000 / 60;

/** Set on the effect canvas once the requested frame is on screen. */
export const GOLDEN_FRAME_ATTRIBUTE = 'data-golden-frame';

export interface GoldenFrameRequest {
	presetId: string;
	frameMs: number;
	sigil: string;
}

/** Narrows an arbitrary string, so a URL cannot select a sigil the lab does not offer. */
export function labSigilFrom(value: string | null): string {
	return value && SIGIL_OPTIONS.some((option) => option.id === value) ? value : DEFAULT_SIGIL;
}

/**
 * The timestamp this parameter names, or null when it names none. `Number`
 * reads a missing or blank value as zero, which would turn every `?preset=`
 * deep link into a golden-frame request and freeze the lab on one frame.
 */
function readFrameMs(value: string | null): number | null {
	if (value === null || value.trim() === '') {
		return null;
	}
	const frameMs = Number(value);
	return Number.isFinite(frameMs) && frameMs >= 0 ? frameMs : null;
}

/** The frame this URL asks for, or null for the interactive lab. */
export function readGoldenFrameRequest(url: URL): GoldenFrameRequest | null {
	const presetId = url.searchParams.get('preset');
	const frameMs = readFrameMs(url.searchParams.get('frameMs'));
	if (!presetId || frameMs === null) {
		return null;
	}
	return {
		presetId,
		frameMs,
		sigil: labSigilFrom(url.searchParams.get('sigil'))
	};
}
