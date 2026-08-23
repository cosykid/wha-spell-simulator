/**
 * @file The cell stage: `SpellIR` in, pixels out, through three.js. It keeps the
 * argument list of `render/castRenderer.ts` so the cutover is a swap, and every
 * rule that engine performed still holds here.
 *
 * The clock starts at activation, not at the end of the portal tilt. R-01 makes
 * `charge` content rather than dead time, so the score's first beat spans the
 * tilt on purpose and only the ambient medium is allowed to show in it.
 *
 * There is no ownership flag and no fallback branch. A cast either has a clock,
 * in which case its cells perform it, or it has none and the stage paints
 * nothing. R-11 puts the "nothing" case in the look table instead.
 *
 * @example
 * const stage = new CastStage(effectCanvas);
 * stage.render(spellIR, ring, timestamp, { portalFit });
 */

import * as THREE from 'three';
import { compileScore, scoreTracks } from '../score/compileScore.js';
import { lookRow } from '../looks/table.js';
import { cellFor } from '../cells/registry.js';
import {
	advanceCells,
	bindCouplings,
	newStageClock,
	type Performer,
	type StageClock
} from './frames.js';
import { aimPortalCamera, createPortalCamera } from './portalCamera.js';
import { createSealRoot } from './sealRoot.js';
import { createStageSurface, type StageSurface } from './surface.js';
import { hashSeed } from './rng.js';
import { clamp } from '../../utils/geometry.js';
import type { RingInfo, SpellIR, SpellScore } from '../../types.js';

/**
 * The same option bag `render/castRenderer.ts` takes. It is restated rather than
 * imported because that module is deleted at cutover and this one is not.
 */
export interface CastRenderOptions {
	/** Fraction of canvas height on screen; scales the portal to match the CSS. Defaults to 1. */
	portalFit?: number;
}

export interface CastStageOptions {
	/** Keep the last frame readable, for the scripted-clock path only. */
	preserveDrawingBuffer?: boolean;
}

/** Whether a compiled spell has a cast clock at all. */
function isCasting(spellIR: SpellIR | null | undefined): spellIR is SpellIR {
	return Boolean(
		spellIR?.active && spellIR.valid && !spellIR.prepared && typeof spellIR.activatedAt === 'number'
	);
}

/** A cast in flight: the score being performed, who performs it, and how far in. */
interface RunningCast {
	score: SpellScore;
	performers: Performer[];
	clock: StageClock;
}

export class CastStage {
	readonly #surface: StageSurface;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	/** The compiled spell the running cast belongs to. A change restarts everything. */
	#signature: string | null = null;
	#cast: RunningCast | null = null;

	constructor(canvas: HTMLCanvasElement, options: CastStageOptions = {}) {
		this.#surface = createStageSurface(canvas, {
			preserveDrawingBuffer: options.preserveDrawingBuffer,
			// A restored context has no uploaded geometry, so rebuild the cast rather
			// than trusting what the last one left behind.
			onContextRestored: () => this.reset()
		});
		this.#scene.add(this.#sealRoot);
	}

	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		options: CastRenderOptions = {}
	): void {
		if (this.#surface.lost) {
			return;
		}
		this.#surface.syncSize();
		if (!ring?.found || !isCasting(spellIR)) {
			this.#surface.clear();
			return;
		}

		const { score, performers, clock } = this.#castFor(spellIR);
		const tMs = timestamp - (spellIR.activatedAt ?? 0);
		// Before the strike there is nothing to advance, and past the afterglow the
		// cast is over. Both are well defined and neither is a special case.
		if (tMs < 0 || tMs > score.totalMs) {
			this.#surface.clear();
			return;
		}

		advanceCells(score, performers, clock, tMs);
		aimPortalCamera(this.#camera, {
			canvas: this.#surface.canvas,
			ring,
			portalFit: options.portalFit
		});
		this.#surface.render(this.#scene, this.#camera);
	}

	/** Drop the running cast so the next frame builds it from the strike. */
	reset(): void {
		for (const { cell } of this.#cast?.performers ?? []) {
			this.#sealRoot.remove(cell.group);
			cell.dispose();
		}
		this.#signature = null;
		this.#cast = null;
	}

	/** Give back the context and everything on it. The stage is unusable after this. */
	dispose(): void {
		this.reset();
		this.#surface.dispose();
	}

	/**
	 * The cast for this spell, built once per signature and stepped across frames
	 * from there. Identical signature means identical cast.
	 */
	#castFor(spellIR: SpellIR): RunningCast {
		if (this.#cast && this.#signature === spellIR.signature) {
			return this.#cast;
		}
		this.reset();
		const score = compileScore(spellIR.plan, spellIR);
		const look = lookRow({ sigil: score.sigil, element: score.element });
		const quality = clamp(spellIR.quality);
		const performers = scoreTracks(score).map((track, index) => ({
			track,
			// One stream per track, so adding a cell cannot shift another's form.
			cell: cellFor(track, { seed: hashSeed(`${score.signature}:${index}`), look, quality })
		}));
		for (const { cell } of performers) {
			this.#sealRoot.add(cell.group);
		}
		// The plan's declared couplings, resolved once. Every step after this hands
		// each holder's ceiling to what it holds.
		bindCouplings(performers);
		this.#signature = spellIR.signature;
		this.#cast = { score, performers, clock: newStageClock() };
		return this.#cast;
	}
}
