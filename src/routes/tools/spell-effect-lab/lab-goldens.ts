/**
 * @file Test-only hook for the look golden tier. `?preset=<id>&frameMs=<n>`
 * loads a field preset and steps the preview to a fixed timestamp with a fixed
 * step, instead of following the animation clock, so a Playwright screenshot
 * lands on the same frame every run.
 *
 * Nothing in the app links here. The lab's own UI is unaffected when the
 * parameters are absent. See `tests-e2e/golden-look.e2e.ts`.
 */

/** Step the scripted clock advances by, matching a 60fps frame. */
export const GOLDEN_FRAME_STEP_MS = 1000 / 60;

/** Set on the effect canvas once the requested frame is on screen. */
export const GOLDEN_FRAME_ATTRIBUTE = 'data-golden-frame';

export interface GoldenFrameRequest {
	presetId: string;
	frameMs: number;
}

/** The frame this URL asks for, or null for the interactive lab. */
export function readGoldenFrameRequest(url: URL): GoldenFrameRequest | null {
	const presetId = url.searchParams.get('preset');
	const frameMs = Number(url.searchParams.get('frameMs'));
	if (!presetId || !Number.isFinite(frameMs) || frameMs < 0) {
		return null;
	}
	return { presetId, frameMs };
}
