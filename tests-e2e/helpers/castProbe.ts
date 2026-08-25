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
 * How a sample is taken depends on which engine owns the canvas, and the probe
 * is told rather than left to find out: **asking a canvas for a context it does
 * not have yet creates one**, and a canvas that has handed out a `2d` context
 * can never return WebGL. A `try webgl, else 2d` probe would therefore poison
 * the canvas for whichever style loaded second. So the reader branches on the
 * `data-effect-style` the host stamps on the element and never on a probe.
 *
 * On the stage that reader is `readPixels` off the stage's own context, and the
 * drawing buffer is thrown away at composite unless the page asked to keep it —
 * that is what `?castReadback=1` is for, and `SpellCanvasPage.goto` always asks
 * (`src/lib/cast/stage/readback.ts`). On classic it is `getImageData`, and the
 * readback flag is a no-op because a 2D canvas is always readable.
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
 * The same threshold for the classic engine, which is the value the Canvas2D
 * probe used before the cutover. It is lower because the argument for 32 does
 * not transfer: that number is read off a premultiplied WebGL surface, where no
 * colour channel can stand above the coverage that carried it. `getImageData`
 * is not premultiplied, and classic has no ambient medium lying over the plane
 * for a threshold to have to see past.
 */
const CLASSIC_INK_ALPHA = 8;

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
 * Installs the reader the recorder calls: the share of the effect canvas the
 * cast has lit. The context and the pixel buffer are resolved once per canvas
 * and reused, which costs about 3ms a read on a 1024px stage under SwiftShader.
 *
 * Two readers, picked by the style the host stamped on the element. They are
 * resolved on first read of a given canvas and never before, because resolving
 * one creates a context and only the engine may decide the attributes.
 */
async function armInkReader(page: Page): Promise<void> {
	await page.evaluate(
		({ inkAlpha, classicInkAlpha }: { inkAlpha: number; classicInkAlpha: number }) => {
			const probe = window as unknown as CastProbeWindow;
			if (probe.__castInk) {
				return;
			}

			// The stage renders to the canvas it was handed, unless that canvas had
			// already given out a `2d` context, in which case it inserts an overlay of
			// its own beside it and renders there (`cast/stage/surface.ts`). Classic
			// keeps the canvas it was given, so the overlay lookup is stage-only.
			const stageReader = (asked: HTMLCanvasElement): (() => number) => {
				const canvas =
					asked.parentElement?.querySelector<HTMLCanvasElement>('canvas[data-stage-overlay-for]') ??
					asked;
				const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
				if (!gl) {
					throw new Error('The effect canvas is not a WebGL surface; the stage never built on it.');
				}
				let pixels: Uint8Array | null = null;
				return () => {
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

					// Alpha alone: the stage's surface is premultiplied, so no colour
					// channel can stand above the coverage that carried it.
					let painted = 0;
					for (let index = 3; index < pixels.length; index += 4) {
						if (pixels[index] > inkAlpha) painted += 1;
					}
					return painted / (width * height);
				};
			};

			// `getImageData` is top-down where `readPixels` is bottom-up, which the
			// coverage share does not care about and anything positional would.
			const classicReader = (canvas: HTMLCanvasElement): (() => number) => {
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					throw new Error('The effect canvas refused a 2d context; classic never built on it.');
				}
				return () => {
					const { width, height } = canvas;
					const data = ctx.getImageData(0, 0, width, height).data;
					let painted = 0;
					for (let index = 3; index < data.length; index += 4) {
						if (data[index] > classicInkAlpha) painted += 1;
					}
					return painted / (width * height);
				};
			};

			let bound: HTMLCanvasElement | null = null;
			let read: (() => number) | null = null;

			probe.__castInk = () => {
				const asked = document.querySelector<HTMLCanvasElement>('[data-testid="effect-canvas"]');
				if (!asked) {
					throw new Error('No effect canvas on the page; the cast has nowhere to be read from.');
				}
				// A style switch mounts a fresh element, so the reader is rebound to
				// whichever canvas is there rather than held from the first read.
				if (asked !== bound) {
					bound = asked;
					read =
						asked.dataset.effectStyle === 'classic' ? classicReader(asked) : stageReader(asked);
				}
				return read!();
			};
		},
		{ inkAlpha: INK_ALPHA, classicInkAlpha: CLASSIC_INK_ALPHA }
	);
}

/**
 * The share of the effect canvas lit right now, read through whichever reader
 * the live style needs. Unlike {@link sampleCast} this does not go through the
 * record, so it still answers after a style switch has stopped the recorder.
 */
export async function readCastInk(page: Page): Promise<number> {
	await armInkReader(page);
	return page.evaluate(() => (window as unknown as CastProbeWindow).__castInk!());
}

/**
 * Resolves once the live engine has painted something, on whichever canvas it
 * owns. A style switch replaces that canvas, so a read is allowed to fail while
 * the swap is in flight rather than failing the spec.
 */
export async function waitForCastInk(page: Page, timeoutMs: number): Promise<void> {
	await armInkReader(page);
	await page.waitForFunction(
		() => {
			try {
				return ((window as unknown as CastProbeWindow).__castInk?.() ?? 0) > 0;
			} catch {
				return false;
			}
		},
		undefined,
		{ timeout: timeoutMs }
	);
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
