/**
 * @file The substrate every cell performs on, and the channel each cell is
 * handed a seat at.
 *
 * A cell owns no geometry and no tracer loop. It owns a **choreography**: it
 * writes its channel's {@link TrackFlow} each step and calls `perform`, and the
 * channel advances its own seeded tracer population under the cast's one
 * element row. The skin, the washes and the ambient (the GPU half, in
 * `volumeStage.ts`) only watch these arrays.
 *
 * This half is pure CPU and pure arithmetic: no three.js, no context, no
 * clock. The golden tier performs a whole cast through it in plain Node.
 *
 * @example
 * const substrate = new VolumeSubstrate(tracks, key, signature);
 * substrate.channels[0].flow.emission = 0.8;
 * substrate.channels[0].perform(tMs, dtS);
 */

import { volumeElementFor, MOTION, SKIN, type VolumeElement } from './elements.js';
import { blankFlow, type TrackFlow } from './flow.js';
import { allocateSeats } from './pool.js';
import { TracerPop, type TracerDigest, type TracerReading } from './tracers.js';
import { hashSeed } from '../rng.js';
import type { ElementId, ScoreTrack } from '../../types.js';

export type { TracerDigest, TracerReading };

/** What a cast paints from: the sigil that was drawn, and the element behind it. */
export interface VolumeKey {
	sigil: string | null;
	element: ElementId | null;
}

/**
 * One track's seat at the substrate: the flow its cell writes and the tracer
 * population that obeys it. Nothing else in the cast may write either.
 */
export class VolumeChannel {
	readonly flow: TrackFlow = blankFlow();
	readonly tracers: TracerPop;
	/** Which track this seat belongs to, for the skin's own bookkeeping. */
	readonly kind: ScoreTrack['kind'];

	constructor(kind: ScoreTrack['kind'], element: VolumeElement, capacity: number, seed: number) {
		this.kind = kind;
		this.tracers = new TracerPop(element, capacity, seed);
	}

	/** Tracer seats this channel owns. Fixed for the life of the cast. */
	get parcels(): number {
		return this.tracers.capacity;
	}

	get live(): number {
		return this.tracers.live;
	}

	get born(): number {
		return this.tracers.born;
	}

	/** Advances this channel's population one fixed step of the cast clock. */
	perform(tMs: number): void {
		this.tracers.step(this.flow, tMs);
	}

	/** Where this channel's mass stands, for the golden tier and the probes. */
	read(out: TracerReading): void {
		this.tracers.measure(out);
	}

	/** Drops everything in flight so the cast replays from the charge. */
	reset(): void {
		this.tracers.reset();
	}
}

/** The shared tracer machine, one per cast, resolved to one element row. */
export class VolumeSubstrate {
	readonly channels: VolumeChannel[];
	/** The one row this cast moves and paints with (sigil, else element, else inert). */
	readonly element: VolumeElement;

	constructor(tracks: readonly ScoreTrack[], key: VolumeKey, signature: string) {
		this.element = volumeElementFor(key.sigil, key.element);
		const seats = allocateSeats(tracks);
		this.channels = tracks.map(
			(track, index) =>
				new VolumeChannel(
					track.kind,
					this.element,
					seats[index],
					// One stream per channel, seeded beside its cell's, so a population
					// and the choreography driving it can never disagree about which
					// cast this is.
					hashSeed(`${signature}:tracers:${index}`)
				)
		);
	}

	/** The element's own physics row, for the GPU half's per-cast setup. */
	get motion() {
		return MOTION[this.element];
	}

	/** The element's field-shaping row, read by the skin every repolygonize. */
	get skin() {
		return SKIN[this.element];
	}

	/**
	 * Live mass on or near the paper across every channel, fade-weighted. The
	 * ground wash's gauge: it grows as matter lands and dies with the cast.
	 */
	groundMass(): number {
		let mass = 0;
		for (const channel of this.channels) {
			mass += channel.tracers.groundMass();
		}
		return mass;
	}

	/**
	 * The vertical band the visible mass actually occupies, for the skin's heat
	 * axis. Measured on the tracers rather than declared, so a held ball is hot
	 * at its own base and spent at its own crown wherever it hovers, and a
	 * column keeps the paper-to-reach axis it had.
	 */
	heatBand(out: { lo: number; hi: number }): void {
		let lo = Infinity;
		let hi = -Infinity;
		for (const channel of this.channels) {
			if (channel.kind === 'shimmer' || channel.flow.deposit <= 0) continue;
			const { pos, alive, fade, capacity } = channel.tracers;
			for (let i = 0; i < capacity; i += 1) {
				if (!alive[i] || fade[i] < 0.15) continue;
				const z = pos[i * 3 + 2];
				if (z < lo) lo = z;
				if (z > hi) hi = z;
			}
		}
		if (!Number.isFinite(lo)) {
			out.lo = 0;
			out.hi = 1;
			return;
		}
		out.lo = lo;
		// A floor on the span, or a thin plate of mass would posterize violently.
		out.hi = Math.max(hi, out.lo + 0.5);
	}

	/** The strongest drain any channel declares, for drying the wash out. */
	drain(): number {
		let drain = 0;
		for (const channel of this.channels) {
			if (channel.flow.drain > drain) drain = channel.flow.drain;
		}
		return drain;
	}

	reset(): void {
		for (const channel of this.channels) {
			channel.reset();
		}
	}
}
