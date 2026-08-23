/**
 * The in-page half of reading a cast: everything that runs inside the browser
 * on R-01's beat clock. `SpellCanvasPage` is the vocabulary a spec uses; this is
 * what it evaluates.
 *
 * Every timestamp here is cast-relative, measured from the moment the status
 * line read "Active spell", which {@link armCastClock} stamps.
 *
 * The cast is **recorded as it plays and read back afterwards**. A spec that
 * asks for a frame once the cast is already running has to get there through
 * `expectActive` and a few `expect` polls first, and those round trips can spend
 * most of a beat: the charge is 980ms and a loaded machine walks past it. So the
 * page starts sampling the moment it stamps activation, on its own rAF loop,
 * and the spec picks its timestamps out of the record.
 *
 * The effect canvas is the cell stage's WebGL surface, so a sample is
 * `readPixels` off the stage's own context rather than `getImageData`: a canvas
 * hosting WebGL never hands out a `2d` one, and its drawing buffer is thrown
 * away at composite unless the page asked to keep it. That is what
 * `?castReadback=1` is for, and `SpellCanvasPage.goto` always asks
 * (`src/lib/cast/stage/readback.ts`).
 */

import type { Page } from '@playwright/test';

/** One reading the in-page recorder took, on the cast's own clock. */
interface CastReading {
	tMs: number;
	coverage: number;
}

/** The window fields the probes write. Nothing outside this file reads them. */
interface CastProbeWindow {
	__sealUpAt?: number;
	__activeAt?: number;
	/** Installed by {@link armInkReader}. The share of the stage the cast has lit, 0..1. */
	__castInk?: () => number;
	/** Every reading since activation, oldest first. */
	__castTrack?: CastReading[];
	/** True once the recorder stopped: the cast emptied, or it ran out of room. */
	__castOver?: boolean;
}

/**
 * Alpha a pixel needs before it counts as the cast's own light rather than
 * R-10's ambient medium. The medium is a faint haze lying over most of the seal
 * plane, so a threshold near zero measures how far the haze reaches and says
 * nothing about the spell: at 12% of full alpha the charge beat reads about a
 * tenth of the body, which is the shape R-01 describes. An empty stage is all
 * zeroes either way.
 */
const INK_ALPHA = 32;

/**
 * Frames between readings. A read is a stall of a few milliseconds against a
 * frame of about twenty, so reading every frame would slow the cast being
 * watched; every third gives the record about 50ms of resolution, which is a
 * twentieth of the shortest beat.
 */
const FRAMES_PER_READING = 3;

/** How long the recorder keeps going before it gives up on the cast ever emptying. */
const RECORD_MS = 25_000;

/** Slack over the timestamp being waited for, before the wait is called a failure. */
const WAIT_SLACK_MS = 15_000;

/** One look at the effect canvas, taken at a cast-relative moment. */
export interface CastSample {
	/** Cast-relative millisecond the sample was asked for. */
	atMs: number;
	/** Cast-relative millisecond the reading was actually taken at. */
	takenAtMs: number;
	/** Fraction of the effect canvas carrying the cast's own light, 0..1. */
	coverage: number;
}

/**
 * Arms everything a cast is read with: a one-shot `pointerup` listener that
 * marks circle completion, a `MutationObserver` on the status line that stamps
 * activation, and the recorder that starts on that same stamp. Call it before
 * the sealing gesture, or the pointerup it catches is the wrong one.
 */
export async function armCastClock(page: Page): Promise<void> {
	await armInkReader(page);
	await page.evaluate(
		({ framesPerReading, recordMs }: { framesPerReading: number; recordMs: number }) => {
			const status = document.querySelector('[data-testid="status-value"]');
			const probe = window as unknown as CastProbeWindow;
			probe.__sealUpAt = undefined;
			probe.__activeAt = undefined;
			probe.__castTrack = undefined;
			probe.__castOver = false;

			// Reads the stage every few frames from activation until it comes up empty.
			// Owning the loop in the page is what keeps a sample's timestamp a property
			// of the cast rather than of how busy the test runner was.
			const record = (activatedAt: number) => {
				const track: CastReading[] = [];
				probe.__castTrack = track;
				let frame = 0;
				let lit = false;
				const step = () => {
					// A second arming supersedes this loop rather than writing behind it.
					if (probe.__castTrack !== track) return;
					frame += 1;
					if (frame % framesPerReading === 0) {
						const tMs = performance.now() - activatedAt;
						const coverage = probe.__castInk!();
						track.push({ tMs, coverage });
						lit ||= coverage > 0;
						if ((lit && coverage === 0) || tMs >= recordMs) {
							probe.__castOver = true;
							return;
						}
					}
					requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			};

			const isActive = () => status?.textContent?.trim() === 'Active spell';
			const observer = new MutationObserver(() => {
				if (probe.__activeAt === undefined && isActive()) {
					probe.__activeAt = performance.now();
					observer.disconnect();
					record(probe.__activeAt);
				}
			});
			if (status) {
				observer.observe(status, { childList: true, characterData: true, subtree: true });
			}
			window.addEventListener(
				'pointerup',
				() => {
					probe.__sealUpAt = performance.now();
				},
				{ once: true, capture: true }
			);
		},
		{ framesPerReading: FRAMES_PER_READING, recordMs: RECORD_MS }
	);
}

/** Seal-to-active latency, both ends timed in the page. `Infinity` if it never activated. */
export async function readActivationLatency(page: Page, timeoutMs: number): Promise<number> {
	const timing = await page
		.waitForFunction(
			() => {
				const probe = window as unknown as CastProbeWindow;
				return probe.__sealUpAt !== undefined && probe.__activeAt !== undefined
					? { sealUpAt: probe.__sealUpAt, activeAt: probe.__activeAt }
					: null;
			},
			undefined,
			{ timeout: timeoutMs }
		)
		.then((handle) => handle.jsonValue());

	if (!timing) return Infinity;
	return timing.activeAt - timing.sealUpAt;
}

/**
 * Installs the reader the recorder calls: the share of the stage's drawing
 * buffer the cast has lit. The context and the pixel buffer are resolved once
 * and reused, which costs about 3ms a read on a 1024px stage under SwiftShader.
 */
async function armInkReader(page: Page): Promise<void> {
	await page.evaluate((inkAlpha: number) => {
		const probe = window as unknown as CastProbeWindow;
		if (probe.__castInk) {
			return;
		}

		// The stage renders to the canvas it was handed, unless that canvas had
		// already given out a `2d` context, in which case it inserts an overlay of
		// its own beside it and renders there (`cast/stage/surface.ts`).
		const stageCanvas = (): HTMLCanvasElement | null => {
			const asked = document.querySelector<HTMLCanvasElement>('[data-testid="effect-canvas"]');
			const overlay = asked?.parentElement?.querySelector<HTMLCanvasElement>(
				'canvas[data-stage-overlay-for]'
			);
			return overlay ?? asked;
		};

		let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
		let pixels: Uint8Array | null = null;

		probe.__castInk = () => {
			const canvas = stageCanvas();
			if (!canvas) {
				throw new Error('No effect canvas on the page; the cast has nowhere to be read from.');
			}
			// Resolved on first read and never before: asking a canvas for a context
			// it does not have yet creates one, and the stage has to be the caller
			// that sets the attributes.
			gl ??= canvas.getContext('webgl2') ?? canvas.getContext('webgl');
			if (!gl) {
				throw new Error('The effect canvas is not a WebGL surface; the stage never built on it.');
			}

			const width = gl.drawingBufferWidth;
			const height = gl.drawingBufferHeight;
			const bytes = width * height * 4;
			if (!pixels || pixels.length !== bytes) {
				pixels = new Uint8Array(bytes);
			}
			// The frame the stage drew last, kept readable by `?castReadback=1`. No
			// framebuffer is bound here: the stage renders straight to the default
			// one and three.js caches that binding.
			gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

			// Alpha alone: the stage's surface is premultiplied, so no colour channel
			// can stand above the coverage that carried it.
			let painted = 0;
			for (let index = 3; index < pixels.length; index += 4) {
				if (pixels[index] > inkAlpha) painted += 1;
			}
			return painted / (width * height);
		};
	}, INK_ALPHA);
}

/** Resolves once the record reaches `tMs`, or the cast ends before it does. */
async function waitForRecord(page: Page, tMs: number): Promise<void> {
	await page.waitForFunction(
		(reached: number) => {
			const probe = window as unknown as CastProbeWindow;
			const track = probe.__castTrack;
			if (!track) return false;
			const last = track[track.length - 1];
			return probe.__castOver === true || (last !== undefined && last.tMs >= reached);
		},
		tMs,
		{ timeout: tMs + WAIT_SLACK_MS }
	);
}

/**
 * The effect canvas at each of `atMs`, taken from the record the page kept while
 * the cast played. Each sample is the first reading at or past the timestamp
 * asked for, so `takenAtMs` says which frame the coverage belongs to.
 */
export async function sampleCast(page: Page, atMs: number[]): Promise<CastSample[]> {
	await waitForRecord(page, Math.max(...atMs));
	return page.evaluate((times: number[]) => {
		const probe = window as unknown as CastProbeWindow;
		const track = probe.__castTrack;
		if (!track?.length) {
			throw new Error('Cast clock is not armed; call armCastClock() before sealing.');
		}
		return times.map((atMs) => {
			const reading = track.find((one) => one.tMs >= atMs) ?? track[track.length - 1];
			return { atMs, takenAtMs: reading.tMs, coverage: reading.coverage };
		});
	}, atMs);
}

/**
 * Waits for the one-shot to finish: resolves with the cast-relative millisecond
 * at which the effect canvas came up empty, or `deadlineMs` if it never did.
 */
export async function waitForCastEnd(page: Page, deadlineMs: number): Promise<number> {
	await waitForRecord(page, deadlineMs);
	return page.evaluate((deadline: number) => {
		const probe = window as unknown as CastProbeWindow;
		const track = probe.__castTrack;
		if (!track?.length) {
			throw new Error('Cast clock is not armed; call armCastClock() before sealing.');
		}
		// The first empty reading after the cast had lit something. Before that a
		// zero is only the stage waiting for the strike.
		let lit = false;
		for (const reading of track) {
			if (reading.coverage > 0) lit = true;
			else if (lit) return reading.tMs;
		}
		return deadline;
	}, deadlineMs);
}
