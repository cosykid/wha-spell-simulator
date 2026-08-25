/**
 * @file The classic engine's own numbers. `particleBaseCount` and `particleCap`
 * used to live in `CONFIG.renderer`, where every layer could reach them; they
 * belong to this engine alone, so they sit here the way `PORTAL` and `STAGE` sit
 * with the things they describe.
 *
 * The frame numbers are the reason every classic effect integrates in 60fps
 * frame units rather than milliseconds.
 */

export const CLASSIC = {
	/** Particles a full-emission effect aims for before force and scale scale it. */
	particleBaseCount: 130,

	/** Hard ceiling on live particles, whatever the spell asks for. */
	particleCap: 360,

	/** How long the effect takes to fade once the spell's duration is spent. */
	endFadeMs: 420,

	/** One frame at 60fps. `dt` is measured in these, not in milliseconds. */
	targetFrameMs: 16.67,

	/** A stalled tab must not teleport particles, and a fast one must still move them. */
	deltaFrameMin: 0.4,
	deltaFrameMax: 2.5
} as const;

/** What an effect draw function is handed instead of the whole `AppConfig`. */
export type ClassicTuning = typeof CLASSIC;
