/**
 * @file The cast stage: `SpellIR` in, pixels out, through three.js. It keeps the
 * argument list of the Canvas2D engine it replaced so every host is a swap, and
 * every rule that engine performed still holds here.
 *
 * The clock starts at activation, not at the end of the portal tilt. R-01 makes
 * `charge` content rather than dead time, so the score's first beat spans the
 * tilt on purpose and only the ambient medium is allowed to show in it.
 *
 * There is no ownership flag and no fallback branch within the stage. A cast
 * either has a clock, in which case its cells perform it, or it has none and the
 * stage paints nothing. R-11 puts the "nothing" case in the look table instead.
 *
 * @example
 * const stage = new CastStage(effectCanvas);
 * stage.render(spellIR, ring, timestamp, { portalFit });
 */

import * as THREE from 'three';
import { compileScore, scoreTracks } from '../score/compileScore.js';
import { lookRow } from '../looks/table.js';
import { cellFor } from '../cells/registry.js';
import { VolumeSubstrate } from '../volume/substrate.js';
import { VolumeStage } from '../volume/volumeStage.js';
import { PAINT_BURST, PAINT_EVERY } from '../volume/tuning.js';
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
import { hashSeed } from '../rng.js';
import { isCasting, type CastEngine, type CastRenderOptions } from '../engine.js';
import { clamp } from '../../utils/geometry.js';
import type { RingInfo, SpellIR, SpellScore } from '../../types.js';

export type { CastRenderOptions };

export interface CastStageOptions {
	/** Keep the last frame readable, for the scripted-clock path only. */
	preserveDrawingBuffer?: boolean;
}

/** A cast in flight: the score being performed, who performs it, and how far in. */
interface RunningCast {
	score: SpellScore;
	performers: Performer[];
	clock: StageClock;
}

export class CastStage implements CastEngine {
	readonly #surface: StageSurface;
	readonly #scene = new THREE.Scene();
	readonly #camera = createPortalCamera();
	readonly #sealRoot = createSealRoot();
	/**
	 * The volume every cast is skinned with. It belongs to the stage rather than
	 * to a cast: the polygonizer's buffers are the same for every spell, and a
	 * cast only attaches its element row.
	 */
	readonly #pigment: VolumeStage;
	/** The compiled spell the running cast belongs to. A change restarts everything. */
	#signature: string | null = null;
	/**
	 * Which performance the running cast is. Two casts of one drawing carry the
	 * same signature and are still two casts, so the activation stamp is what
	 * tells them apart: `carrySpellActivation` holds it steady across the
	 * recompiles of one performance and a new cast is stamped afresh.
	 */
	#activatedAt: number | null = null;
	#cast: RunningCast | null = null;

	constructor(canvas: HTMLCanvasElement, options: CastStageOptions = {}) {
		this.#surface = createStageSurface(canvas, {
			preserveDrawingBuffer: options.preserveDrawingBuffer,
			// A restored context has no uploaded geometry, so rebuild the cast rather
			// than trusting what the last one left behind.
			onContextRestored: () => this.reset()
		});
		this.#pigment = new VolumeStage(this.#surface.renderer);
		this.#sealRoot.add(this.#pigment.group);
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
		// Compile and bake on the first frame the stage ever draws, which is long
		// before a seal is closed. The parcel program takes the better part of a
		// second to build on a software device, and the cast clock is already
		// running by the time a score exists.
		this.#pigment.warm(this.#scene, this.#camera);
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

		const canvas = this.#surface.canvas;
		const pigment = this.#pigment;
		// Aimed before the cells are advanced, because the paint at the end of the
		// call billboards the ambient washes against the camera.
		aimPortalCamera(this.#camera, {
			canvas,
			ring,
			portalFit: options.portalFit
		});

		let paints = 0;
		advanceCells(score, performers, clock, tMs, (stepped, stepsLeft) => {
			// The skin repolygonizes once per two steps of the product clock, and at
			// most once per call however far behind it fell: the field is rebuilt
			// from the live tracers every time, so a call that caught up simulates
			// silently and paints only its final state. Painting every caught-up
			// step is the catch-up spiral the prototype diagnosed.
			const wanted = stepped.steps % PAINT_EVERY === 0;
			if (!wanted || stepsLeft >= PAINT_BURST * PAINT_EVERY) {
				return;
			}
			pigment.paint(this.#scene, this.#camera, stepped.tMs);
			paints += 1;
		});
		if (paints === 0) {
			pigment.present(this.#scene, this.#camera);
		}
	}

	/** Drop the running cast so the next frame builds it from the strike. */
	reset(): void {
		for (const { cell } of this.#cast?.performers ?? []) {
			cell.dispose();
		}
		this.#pigment.detach();
		this.#signature = null;
		this.#activatedAt = null;
		this.#cast = null;
	}

	/** Give back the context and everything on it. The stage is unusable after this. */
	dispose(): void {
		this.reset();
		this.#pigment.dispose();
		this.#surface.dispose();
	}

	/**
	 * The cast for this performance, built once and stepped across frames from
	 * there. The same spell performed again is a new cast: its clock counts from
	 * its own activation, and the one it would inherit has already run out.
	 */
	#castFor(spellIR: SpellIR): RunningCast {
		if (
			this.#cast &&
			this.#signature === spellIR.signature &&
			this.#activatedAt === spellIR.activatedAt
		) {
			return this.#cast;
		}
		this.reset();
		const score = compileScore(spellIR.plan, spellIR);
		const look = lookRow({ sigil: score.sigil, element: score.element });
		const quality = clamp(spellIR.quality);
		const tracks = scoreTracks(score);
		// One substrate for the whole cast: the tracer pool is shared and
		// partitioned by what each track has to fill, so a five-track spell costs
		// one budget, and every track's matter merges into one body per element.
		const substrate = new VolumeSubstrate(
			tracks,
			{ sigil: score.sigil, element: score.element },
			score.signature
		);
		const performers = tracks.map((track, index) => ({
			track,
			// One stream per track, so adding a cell cannot shift another's form.
			cell: cellFor(track, {
				seed: hashSeed(`${score.signature}:${index}`),
				look,
				quality,
				channel: substrate.channels[index]
			})
		}));
		// The plan's declared couplings, resolved once. Every step after this hands
		// each holder's ceiling to what it holds.
		bindCouplings(performers);

		this.#pigment.attach(substrate, this.#scene, this.#camera);
		this.#signature = spellIR.signature;
		this.#activatedAt = spellIR.activatedAt;
		this.#cast = { score, performers, clock: newStageClock() };
		return this.#cast;
	}
}
