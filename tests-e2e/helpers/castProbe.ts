/**
 * The in-page half of reading a cast: everything that runs inside the browser
 * on R-01's beat clock. `SpellCanvasPage` is the vocabulary a spec uses; this is
 * what it evaluates.
 *
 * Every timestamp here is cast-relative, measured from the moment the status
 * line read "Active spell", which {@link armCastClock} stamps.
 */

import type { Page } from '@playwright/test';

/** The window fields the probes write. Nothing outside this file reads them. */
interface CastProbeWindow {
	__sealUpAt?: number;
	__activeAt?: number;
}

/** One look at the effect canvas, taken at a cast-relative moment. */
export interface CastSample {
	/** Cast-relative millisecond the sample was asked for. */
	atMs: number;
	/** Cast-relative millisecond it was actually taken at; the frame loop lands a little late. */
	takenAtMs: number;
	/** Fraction of the effect canvas carrying visible ink, 0..1. */
	coverage: number;
}

/**
 * Arms both probes: a one-shot `pointerup` listener that marks circle
 * completion, and a `MutationObserver` on the status line that stamps
 * activation. Call it before the sealing gesture, or the pointerup it catches is
 * the wrong one.
 */
export async function armCastClock(page: Page): Promise<void> {
	await page.evaluate(() => {
		const status = document.querySelector('[data-testid="status-value"]');
		const probe = window as unknown as CastProbeWindow;
		probe.__sealUpAt = undefined;
		probe.__activeAt = undefined;
		const isActive = () => status?.textContent?.trim() === 'Active spell';
		const observer = new MutationObserver(() => {
			if (probe.__activeAt === undefined && isActive()) {
				probe.__activeAt = performance.now();
				observer.disconnect();
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
	});
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
 * The effect canvas at each of `atMs`, sampled in one pass. It has to be one
 * pass: a round trip between two samples can step the cast past a beat.
 */
export async function sampleCast(page: Page, atMs: number[]): Promise<CastSample[]> {
	return page.evaluate(async (times: number[]) => {
		const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="effect-canvas"]');
		const activatedAt = (window as unknown as CastProbeWindow).__activeAt;
		if (!canvas || activatedAt === undefined) {
			throw new Error('Cast clock is not armed; call armCastClock() before sealing.');
		}
		const ctx = canvas.getContext('2d')!;
		const pixels = canvas.width * canvas.height;
		const samples = [];

		for (const atMs of times) {
			await new Promise<void>((resolve) => {
				const wait = () =>
					performance.now() - activatedAt >= atMs ? resolve() : requestAnimationFrame(wait);
				requestAnimationFrame(wait);
			});
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			let painted = 0;
			for (let index = 3; index < data.length; index += 4) {
				if (data[index] > 8) painted += 1;
			}
			samples.push({
				atMs,
				takenAtMs: performance.now() - activatedAt,
				coverage: painted / pixels
			});
		}

		return samples;
	}, atMs);
}

/**
 * Waits for the one-shot to finish: resolves with the cast-relative millisecond
 * at which the effect canvas came up empty, or `deadlineMs` if it never did.
 */
export async function waitForCastEnd(page: Page, deadlineMs: number): Promise<number> {
	return page.evaluate(async (deadline: number) => {
		const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="effect-canvas"]');
		const activatedAt = (window as unknown as CastProbeWindow).__activeAt;
		if (!canvas || activatedAt === undefined) {
			throw new Error('Cast clock is not armed; call armCastClock() before sealing.');
		}
		const ctx = canvas.getContext('2d')!;
		const isPainted = () => {
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			for (let index = 3; index < data.length; index += 4) {
				if (data[index] > 8) return true;
			}
			return false;
		};

		// Polled rather than sampled every frame: reading a megapixel back off the
		// canvas 60 times a second would slow the cast it is watching.
		return new Promise<number>((resolve) => {
			const step = () => {
				const elapsed = performance.now() - activatedAt;
				if (!isPainted() || elapsed >= deadline) resolve(elapsed);
				else setTimeout(step, 100);
			};
			step();
		});
	}, deadlineMs);
}
