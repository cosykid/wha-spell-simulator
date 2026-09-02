import { expect, type Locator, type Page } from '@playwright/test';
import { CAST_READBACK_PARAM } from '../../src/lib/cast/stage/readback.js';
import { type CastableSpell } from '../fixtures/sampleSpells.js';
import * as castProbe from '../helpers/castProbe.js';
import { circleStroke } from '../helpers/strokes.js';
import { NormPoint, NormStroke, RingGeometry } from '../helpers/types.js';

export const DEFAULT_RING: RingGeometry = {
	center: { x: 0.497, y: 0.517 },
	radius: 0.471
};

export type { CastSample } from '../helpers/castProbe.js';

export interface DrawStrokeOptions {
	/**
	 * Pause after committing the stroke so the (async, debounced) recognition
	 * pipeline can recompute before the next stroke lands. Defaults to a small
	 * settle delay; raise it for flaky machines.
	 */
	settleMs?: number;
}

export interface CastSpellOptions extends DrawStrokeOptions {
	/**
	 * Degrees of arc left open in the ring before sealing. Defaults to 10. Pass 0
	 * to draw a fully closed ring up front (the canvas would lock immediately).
	 */
	gapDeg?: number;
	/** Stop after drawing the open ring and symbols, leaving the spell prepared. */
	skipSeal?: boolean;
}

const DEFAULT_SETTLE_MS = 90;
/** Longest a sealed ring may take to compile into an active spell. */
const ACTIVATION_TIMEOUT_MS = 15_000;

// The ring gap is centered at the bottom of the circle (90 degrees in screen
// orientation, where +y points down).
const GAP_CENTER_DEG = 90;
const DEFAULT_GAP_DEG = 10;
// Extra arc the sealing stroke extends past each edge of the gap so its ink
// reliably overlaps the open ring's ends.
const SEAL_OVERLAP_DEG = 6;

// The sample spells were captured against the full canvas (coordinates run from
// ~0.01 to ~0.96). Drawing them inset from the edges keeps strokes clear of the
// canvas border and any surrounding chrome.
const DEFAULT_DRAW_SCALE = 0.85;
const DRAW_CENTER: NormPoint = { x: 0.5, y: 0.5 };

/**
 * Page object for the spell drawing surface.
 *
 * It owns every interaction with the two stacked canvases: it exposes locator
 * getters keyed off `data-testid` attributes, low-level stroke primitives that
 * translate normalized (0..1) coordinates into trusted pointer input, and a
 * high-level {@link castSpell} helper for replaying a whole sample spell.
 */
export class SpellCanvasPage {
	readonly page: Page;

	/** Shrinks the drawing toward {@link DRAW_CENTER} so it sits inset from the edges. */
	drawScale: number;

	constructor(page: Page, options: { drawScale?: number } = {}) {
		this.page = page;
		this.drawScale = options.drawScale ?? DEFAULT_DRAW_SCALE;
	}

	// --- Locators (test IDs) -------------------------------------------------

	get glyphCanvas(): Locator {
		return this.page.getByTestId('glyph-canvas');
	}

	get effectCanvas(): Locator {
		return this.page.getByTestId('effect-canvas');
	}

	/** The control that swaps which engine performs a cast. */
	get effectStyleToggle(): Locator {
		return this.page.getByTestId('effect-style-toggle');
	}

	/** The control that mutes the cast. Pressed means silent. */
	get soundToggle(): Locator {
		return this.page.getByTestId('sound-toggle');
	}

	get canvasShell(): Locator {
		return this.page.getByTestId('canvas-shell');
	}

	get canvasHint(): Locator {
		return this.page.getByTestId('canvas-hint');
	}

	get statusValue(): Locator {
		return this.page.getByTestId('status-value');
	}

	get elementValue(): Locator {
		return this.page.getByTestId('element-value');
	}

	get manifestationValue(): Locator {
		return this.page.getByTestId('manifestation-value');
	}

	get clearButton(): Locator {
		return this.page.getByTestId('clear-button');
	}

	get undoButton(): Locator {
		return this.page.getByTestId('undo-button');
	}

	get redoButton(): Locator {
		return this.page.getByTestId('redo-button');
	}

	/** The note a spent cast leaves, holding both ways out of a finished page. */
	get statusNote(): Locator {
		return this.page.getByTestId('status-note');
	}

	/** Takes the sealing stroke back, leaving the rest of the diagram to edit. */
	get reopenRingButton(): Locator {
		return this.page.getByTestId('reopen-ring-button');
	}

	/** Clears the spent page, one undo away from the spell. */
	get freshPageButton(): Locator {
		return this.page.getByTestId('fresh-page-button');
	}

	// --- Keyboard ------------------------------------------------------------

	/**
	 * Undo through the keyboard, which is the only way to jump the drawing faster
	 * than recognition can answer: the toolbar buttons disable themselves off the
	 * summary a recognition pass writes, and the shortcut waits for nothing. The
	 * handler reads meta on a Mac and control everywhere else, which is what
	 * `ControlOrMeta` resolves to.
	 */
	async undoShortcut(): Promise<void> {
		await this.page.keyboard.press('ControlOrMeta+z');
	}

	/** Redo through the keyboard. See {@link undoShortcut}. */
	async redoShortcut(): Promise<void> {
		await this.page.keyboard.press('ControlOrMeta+Shift+z');
	}

	// --- Navigation / readiness ---------------------------------------------

	/**
	 * Loads the simulator and waits until the canvas accepts strokes.
	 *
	 * Always with `?castReadback=1`, the one thing an e2e page asks the app for
	 * that production does not: the effect canvas is WebGL and drops its frame at
	 * composite, so without it every pixel a spec reads back is blank. It is the
	 * whole difference between the page under test and the shipped one.
	 *
	 * A fresh browser context looks like a first visit, so the first-spell guide
	 * would open its modal welcome card and swallow every pointer gesture. The
	 * page object pre-seeds the guide's seen flag by default; the guide's own
	 * spec passes `firstSpellSeen: false` to get the real first-visit flow.
	 */
	async goto(options: { firstSpellSeen?: boolean } = {}): Promise<void> {
		if (options.firstSpellSeen ?? true) {
			await this.page.addInitScript(() => {
				const KEY = 'wha-spell-simulator:toggle-preferences';
				try {
					const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
					localStorage.setItem(KEY, JSON.stringify({ ...stored, firstSpellGuideSeen: true }));
				} catch {
					// Unreadable storage also blocks the flag the app would read, so the
					// guide stays closed either way.
				}
			});
		}
		await this.page.goto(`/?${CAST_READBACK_PARAM}=1`);
		await this.waitForReady();
	}

	/**
	 * Waits until the canvas actually accepts strokes. The status text can leave
	 * "Loading" before drawing capture has attached its pointer listeners, so we
	 * wait on the explicit `data-input-ready` signal the page sets the moment
	 * capture is enabled.
	 */
	async waitForReady(): Promise<void> {
		await expect(this.glyphCanvas).toBeVisible();
		await expect(this.glyphCanvas).toHaveAttribute('data-input-ready', 'true', {
			timeout: 30_000
		});
	}

	/**
	 * Waits until the paper has stopped moving under the portal tilt.
	 *
	 * The tilt is a 980ms CSS transition on the glyph canvas and pointer positions
	 * are mapped through the canvas box as it stands, so a stroke drawn while the
	 * paper is still easing lands where the drawer never aimed, or misses the
	 * element altogether. Any spec that draws just after a spell ends has to let
	 * the paper come back down first. Two identical boxes in a row is that.
	 */
	async waitForPaperSettled(): Promise<void> {
		let previous: string | null = null;
		await expect
			.poll(
				async () => {
					const box = await this.glyphCanvas.boundingBox();
					const current = box
						? [box.x, box.y, box.width, box.height].map(Math.round).join(':')
						: null;
					const settled = current !== null && current === previous;
					previous = current;
					return settled;
				},
				{ timeout: 10_000 }
			)
			.toBe(true);
	}

	// --- Drawing primitives --------------------------------------------------

	/** Insets a normalized point toward the draw center by {@link drawScale}. */
	private scaleDown(point: NormPoint): NormPoint {
		return {
			x: DRAW_CENTER.x + (point.x - DRAW_CENTER.x) * this.drawScale,
			y: DRAW_CENTER.y + (point.y - DRAW_CENTER.y) * this.drawScale
		};
	}

	/**
	 * Maps a normalized point to client (viewport) coordinates using the canvas's
	 * current on-screen box. The page's pointer normalizer rescales these back to
	 * the 1000x1000 canvas space, so the round-trip survives zoom and layout.
	 */
	private async toClient(point: NormPoint): Promise<{ x: number; y: number }> {
		const box = await this.glyphCanvas.boundingBox();
		if (!box) {
			throw new Error('Glyph canvas is not visible; cannot resolve draw coordinates.');
		}
		const scaled = this.scaleDown(point);
		return {
			x: box.x + scaled.x * box.width,
			y: box.y + scaled.y * box.height
		};
	}

	/** Draws one stroke as a single continuous pointer gesture (down, move…, up). */
	async drawStroke(stroke: NormStroke, options: DrawStrokeOptions = {}): Promise<void> {
		if (stroke.length < 2) {
			throw new Error('A stroke needs at least two points to register.');
		}

		await this.glyphCanvas.scrollIntoViewIfNeeded();

		const start = await this.toClient(stroke[0]!);
		await this.page.mouse.move(start.x, start.y);
		await this.page.mouse.down();
		for (const point of stroke.slice(1)) {
			const client = await this.toClient(point);
			await this.page.mouse.move(client.x, client.y);
		}
		await this.page.mouse.up();

		await this.page.waitForTimeout(options.settleMs ?? DEFAULT_SETTLE_MS);
	}

	/** Draws a sequence of strokes in order. */
	async drawStrokes(strokes: NormStroke[], options: DrawStrokeOptions = {}): Promise<void> {
		for (const stroke of strokes) {
			await this.drawStroke(stroke, options);
		}
	}

	/**
	 * Taps a point that lies on the paper itself. The portal tilt shrinks the
	 * canvas inside its own bounding box, so the box centre can land in the void
	 * beside the tilted paper. The search walks the centre line downward, toward
	 * the tilt's wide near edge.
	 */
	async tapCanvas(): Promise<void> {
		const point = await this.glyphCanvas.evaluate((el) => {
			const box = el.getBoundingClientRect();
			const x = box.left + box.width / 2;
			for (let fraction = 0.5; fraction < 0.98; fraction += 0.05) {
				const y = box.top + box.height * fraction;
				if (document.elementFromPoint(x, y) === el) {
					return { x, y };
				}
			}
			return null;
		});
		if (!point) {
			throw new Error('No tappable point found on the glyph canvas.');
		}
		await this.page.mouse.click(point.x, point.y);
	}

	// --- Ring primitives -----------------------------------------------------

	/**
	 * Draws the ring as a single arc that stops `gapDeg` degrees short of a full
	 * circle, leaving an opening at the bottom. This is the "incomplete" ring: the
	 * simulator detects it as prepared but keeps input unlocked.
	 */
	async drawOpenRing(
		ring: RingGeometry,
		gapDeg = DEFAULT_GAP_DEG,
		options: DrawStrokeOptions = {}
	): Promise<void> {
		const start = GAP_CENTER_DEG + gapDeg / 2;
		const end = start + (360 - gapDeg);
		await this.drawStroke(circleStroke(ring.center, ring.radius, start, end), options);
	}

	/** The short closing arc across the gap, overlapping both open ends. */
	private sealArc(ring: RingGeometry, gapDeg: number): NormStroke {
		const start = GAP_CENTER_DEG - gapDeg / 2 - SEAL_OVERLAP_DEG;
		const end = GAP_CENTER_DEG + gapDeg / 2 + SEAL_OVERLAP_DEG;
		return circleStroke(ring.center, ring.radius, start, end);
	}

	/**
	 * Draws the short closing arc across the gap, overlapping both open ends so the
	 * ring becomes topologically closed — the moment the spell activates.
	 */
	async sealRing(
		ring: RingGeometry,
		gapDeg = DEFAULT_GAP_DEG,
		options: DrawStrokeOptions = {}
	): Promise<void> {
		await this.drawStroke(this.sealArc(ring, gapDeg), options);
	}

	/**
	 * Arms the in-page cast clock, which every {@link sampleCast} timestamp is
	 * measured from. Call it before the sealing gesture.
	 */
	async armCastClock(): Promise<void> {
		await castProbe.armCastClock(this.page);
	}

	/**
	 * Seals the ring and measures the latency from completing the circle (the
	 * sealing stroke's `pointerup`) to the status reading "Active spell".
	 *
	 * Timing is captured inside the page with `performance.now()`, so the result
	 * excludes Playwright/CDP round-trip overhead. Resolves with the elapsed
	 * milliseconds.
	 */
	async measureActivation(ring: RingGeometry, gapDeg = DEFAULT_GAP_DEG): Promise<number> {
		// Arm before the sealing gesture so the next pointerup is the one that
		// completes the circle.
		await this.armCastClock();

		await this.drawStroke(this.sealArc(ring, gapDeg), { settleMs: 0 });

		return castProbe.readActivationLatency(this.page, ACTIVATION_TIMEOUT_MS);
	}

	// --- High-level spell casting -------------------------------------------

	/**
	 * Casts a spell end to end, following how the simulator expects it:
	 *   1. Draw the outer ring, leaving a small gap (prepared, input unlocked).
	 *   2. Draw the symbols inside the ring's recognition zones.
	 *   3. Seal the gap to close the ring, which activates the spell.
	 *
	 * Pass `skipSeal: true` to stop at the prepared stage.
	 */
	async castSpell(spell: CastableSpell, options: CastSpellOptions = {}): Promise<void> {
		const { gapDeg = DEFAULT_GAP_DEG, skipSeal = false, ...drawOptions } = options;
		await this.drawOpenRing(DEFAULT_RING, gapDeg, drawOptions);
		await this.drawStrokes(spell.symbols, drawOptions);
		if (!skipSeal) {
			await this.sealRing(DEFAULT_RING, gapDeg, drawOptions);
		}
	}

	// --- Reading the cast ----------------------------------------------------

	/** The effect canvas at each cast-relative timestamp, sampled in one page pass. */
	async sampleCast(atMs: number[]): Promise<castProbe.CastSample[]> {
		return castProbe.sampleCast(this.page, atMs);
	}

	/**
	 * The share of the effect canvas lit right now, read through whichever engine
	 * owns it. Unlike {@link sampleCast} this is a single look with no clock, which
	 * is what a style switch mid-cast needs.
	 */
	async readCastInk(): Promise<number> {
		return castProbe.readCastInk(this.page);
	}

	/** Resolves once the live engine has painted something. */
	async waitForCastInk(timeoutMs = ACTIVATION_TIMEOUT_MS): Promise<void> {
		await castProbe.waitForCastInk(this.page, timeoutMs);
	}

	/**
	 * Waits for the one-shot to finish: resolves with the cast-relative
	 * millisecond at which the effect canvas came up empty, or `deadlineMs` if it
	 * never did.
	 */
	async waitForCastEnd(deadlineMs: number): Promise<number> {
		return castProbe.waitForCastEnd(this.page, deadlineMs);
	}

	// --- Assertions ----------------------------------------------------------

	/** Resolves once the spell has activated (ring sealed + sigil recognized). */
	async expectActive(): Promise<void> {
		await expect(this.statusValue).toHaveText('Active spell', { timeout: ACTIVATION_TIMEOUT_MS });
		await expect(this.statusValue).toHaveAttribute('data-status-class', 'active');
	}
}
