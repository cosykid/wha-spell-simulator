/**
 * @file The ambient cell: R-10's thin medium, demoted to garnish.
 *
 * The phase-5 diagnosis named the unconditional shimmer as its third cause: its
 * parcels lived longest, looked the same in every spell, and so took the frame
 * from the spell itself. This cell is the fix, and the fix is two rules. The
 * medium is **one macroscopic shape plus a few dozen strokes**, never a field of
 * specks. And its lit presence is capped hard, in every beat, against numbers
 * that live at the top of this file where they can be read.
 *
 * What it does have is R-01's charge. The charge is content, not dead time —
 * "ink brightens, ambient medium draws inward" — and this is the one cell allowed
 * to manifest in it, so the gather is the strongest thing it ever does.
 *
 * | beat      | the medium                                                    |
 * | --------- | ------------------------------------------------------------- |
 * | charge    | draws inward onto the ring, brightening. Its own beat.         |
 * | strike    | blown back off the ring and dimmed as the spell takes over.    |
 * | body      | pooled, breathing, well under everything the seal manifests.   |
 * | release   | drifting back out and thinning.                                |
 * | afterglow | returning to where it was before the cast, then gone.          |
 */

import { createHazeDisc } from './forms/hazeDisc.js';
import { createMediumMotes, type MoteSeed } from './forms/mediumMotes.js';
import { mulberry32, type Rng } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const AMBIENT = {
	/**
	 * The dominance guard, and the whole reason this file exists. These are peak
	 * alphas at the medium's own loudest moment, the charge; every other beat is a
	 * fraction of them. The haze is capped hardest because it covers the most.
	 */
	alpha: { motes: 0.46, haze: 0.14 },
	/** Motes at zero garnish density, and at full. Dozens, never thousands. */
	motes: { min: 14, max: 46 },
	/** Seal units a mote is seeded out at, past the ring the medium gathers to. */
	home: { min: 1.1, max: 2.25 },
	/** Seal units across one mote. */
	size: { min: 0.05, max: 0.11 },
	/** Seal units the ring rim sits at: what the medium draws in onto. */
	rim: 1,
	/** Where the haze pools at rest, and once it has gathered. */
	peak: { rest: 1.95, gathered: 1.05 },
	/** How far the haze is spread at rest, and once gathered: it tightens as it draws in. */
	spread: { rest: 0.8, gathered: 0.3 },
	/** Soft lobes around the haze. Seeded, so two seals breathe differently. */
	lobes: { min: 4, max: 7 },
	/** Radians per second of the slow breath the pooled medium keeps. */
	breathRate: 1.1,
	/** Fraction of the idle curl the drift actually uses. */
	curl: 0.35
} as const;

/**
 * How far the medium has drawn in, 0 at rest and 1 gathered on the ring. The
 * charge is the only beat that closes it all the way; the strike blows it back.
 */
const GATHER: Record<Beat, (beatT: number) => number> = {
	charge: (t) => t * t,
	strike: (t) => 1 - 0.45 * t,
	body: () => 0.55,
	release: (t) => 0.55 - 0.3 * t,
	afterglow: (t) => 0.25 * (1 - t)
};

/**
 * How lit the medium is, as a fraction of the caps above. The charge is its beat
 * and it peaks there; from the strike on it is background to the spell.
 */
const PRESENCE: Record<Beat, (beatT: number) => number> = {
	charge: (t) => 0.35 + 0.65 * t,
	strike: (t) => 1 - 0.66 * t,
	body: () => 0.34,
	release: (t) => 0.34 - 0.14 * t,
	afterglow: (t) => 0.2 * (1 - t)
};

/**
 * How fast the medium is currently moving, 0..1, which is how far a mote's
 * stroke is drawn out. The charge is the only beat that really rushes, and it
 * rushes hardest just before the strike takes the frame off it.
 */
const RUSH: Record<Beat, (beatT: number) => number> = {
	charge: (t) => Math.min(1, 2 * t),
	strike: () => 0.45,
	body: () => 0.15,
	release: () => 0.3,
	afterglow: () => 0.25
};

function seededMotes(rng: Rng, count: number, ceiling: number): MoteSeed[] {
	return Array.from({ length: count }, () => {
		const bearing = rng() * Math.PI * 2;
		const arm = AMBIENT.home.min + rng() * (AMBIENT.home.max - AMBIENT.home.min);
		return {
			home: {
				x: Math.cos(bearing) * arm,
				y: Math.sin(bearing) * arm,
				// Seeded through the volume, not laid on the paper: the medium is
				// already in the air the seal is about to move.
				z: 0.04 + rng() * ceiling * 1.6
			},
			size: AMBIENT.size.min + rng() * (AMBIENT.size.max - AMBIENT.size.min),
			phase: rng() * Math.PI * 2
		};
	});
}

/** R-10's medium: one haze, a few dozen strokes, and a hard ceiling on both. */
export function createAmbientCell(track: Track<'shimmer'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const params = track.params;
	const material = ctx.look.material;
	const quality = clamp(ctx.quality);

	// The haze is the track's own role, the seal's surface medium. The motes take
	// `wisp`, the table's thin outer medium, because that is what a fleck of the
	// world is made of and it keeps the two layers from painting as one wash.
	const haze = createHazeDisc({
		look: ctx.look[track.look],
		lobes: AMBIENT.lobes.min + Math.floor(rng() * (AMBIENT.lobes.max - AMBIENT.lobes.min + 1))
	});
	const density = clamp(material.garnishDensity) * quality;
	const motes = createMediumMotes({
		look: ctx.look.wisp,
		motes: seededMotes(
			rng,
			Math.round(AMBIENT.motes.min + (AMBIENT.motes.max - AMBIENT.motes.min) * density),
			params.ceiling
		),
		rim: AMBIENT.rim,
		ceiling: params.ceiling
	});
	haze.mesh.name = 'ambient-haze';
	motes.mesh.name = 'ambient-motes';

	// A brighter element carries a brighter medium, but only within the caps: the
	// guard is a ceiling on the whole cell, not a suggestion per material.
	const lit = 0.8 + 0.2 * clamp(material.emissive);

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(haze.mesh, motes.mesh);

	return {
		group,
		update(frame: CellFrame) {
			const tS = frame.tMs / 1000;
			const gather = clamp(GATHER[frame.beat](frame.beatT));
			// The pooled medium breathes. Small, and only once it has gathered, so
			// the charge stays a single continuous draw inward.
			const breath = 1 + 0.12 * gather * Math.sin(tS * AMBIENT.breathRate);
			const presence = clamp(PRESENCE[frame.beat](frame.beatT)) * lit;

			haze.setHaze({
				peak: (AMBIENT.peak.rest + (AMBIENT.peak.gathered - AMBIENT.peak.rest) * gather) * breath,
				width: AMBIENT.spread.rest + (AMBIENT.spread.gathered - AMBIENT.spread.rest) * gather,
				alpha: presence * AMBIENT.alpha.haze,
				// The lobes turn on the gather itself, so the pattern belongs to the
				// motion instead of sliding under it.
				phase: gather * Math.PI * 2 + tS * 0.35
			});
			motes.setDrift({
				inhale: gather,
				alpha: presence * AMBIENT.alpha.motes,
				// A stroke's length is how fast the medium is going, so the charge
				// reads as an inhale in a still frame and the body reads as settled.
				stretch: clamp(RUSH[frame.beat](frame.beatT)),
				tS,
				wander: params.wander * AMBIENT.curl
			});
		},
		dispose() {
			group.clear();
			haze.dispose();
			motes.dispose();
		}
	};
}
