/**
 * @file The burst cell: R-01's strike, made visible. A placeholder for quality
 * and the whole path for correctness — score to track to cell to a lit, moving
 * form in the portal's own perspective.
 *
 * Two pieces of real geometry, no dots. An expanding shock annulus hugging the
 * seal plane carries the event through the cast, and a brief flared column
 * stands off the paper for the length of the strike.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                  |
 * | --------- | --------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.  |
 * | strike    | the flash blooms and the ring is thrown, at peak drive.    |
 * | body      | the ring keeps spreading and thinning as drive decays.     |
 * | release   | it commits: still spreading, letting go of its brightness. |
 * | afterglow | a scorch fading out where the shock passed.                |
 *
 * The catalog's radial ink licks are still to come; they arrive with looks v2.
 */

import { createShockAnnulus } from './forms/shockAnnulus.js';
import { createFlashColumn } from './forms/flashColumn.js';
import { mulberry32 } from '../stage/rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const BURST_CELL = {
	/** Seal units of band behind a young front, and behind an old one. */
	band: { near: 0.42, far: 0.12 },
	/** Seal units of spread over which the band thins from `near` to `far`. */
	bandFadeUnits: 2,
	/** Seal units the shock climbs per unit it spreads, before the track's own rise. */
	liftPerUnit: 0.06,
	/** Ceiling on that climb. The shock hugs the plane; it never becomes a dome. */
	maxLiftUnits: 0.14,
	/** Radians of phase per seal unit of spread. The rim's licks turn as it grows. */
	phasePerUnit: 2.4,
	/** Scallops around the rim. Seeded, so two spells break differently. */
	lobes: { min: 5, max: 9 },
	/** Seal units the flash flares to, and stands, at the peak of the strike. */
	flash: { radius: 0.34, heightUnits: 1.35, restingHeight: 0.35 },
	/** Vertical licks around the flash. */
	flashLicks: 4,
	/** Peak alpha of the annulus. Additive ink piles up, so nothing here is opaque. */
	shockAlpha: 0.85,
	/** Peak alpha of the flash. */
	flashAlpha: 0.9
} as const;

/**
 * How present the shock is through each beat. This table is the cell's answer to
 * "beats are visible": the envelopes say how hard the seal pushes, and this says
 * what the form is doing while it is pushed.
 */
const SHOCK_PRESENCE: Record<Beat, (beatT: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: (t) => 1 - 0.45 * t,
	release: (t) => 0.55 - 0.25 * t,
	afterglow: (t) => 0.3 * (1 - t) * (1 - t)
};

/** An envelope's curve value, 0..1, with its gain divided back out. */
function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

/**
 * The strike as an expanding shell. The front is integrated from the drive
 * envelope in fixed steps, so it is a function of the frames it was given and
 * fresh-to-t agrees with incremental stepping.
 */
export function createBurstCell(track: Track<'burst'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const spread = BURST_CELL.lobes.max - BURST_CELL.lobes.min;
	const lobes = BURST_CELL.lobes.min + Math.floor(rng() * (spread + 1));
	const seedPhase = rng() * Math.PI * 2;
	const look = ctx.look[track.look];

	const shock = createShockAnnulus({
		look,
		lobes,
		// A sloppier seal breaks a rougher rim. The score already paid for
		// strength, so quality buys form here and nothing else.
		roughness: 0.35 + 0.65 * (1 - clamp(ctx.quality))
	});
	const flash = createFlashColumn({ look, licks: BURST_CELL.flashLicks });
	shock.mesh.name = 'burst-shock';
	flash.mesh.name = 'burst-flash';

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(shock.mesh, flash.mesh);

	/** Seal units the shock front has travelled. The cell's only accumulated state. */
	let frontUnits = 0;

	return {
		group,
		update(frame: CellFrame) {
			// R-01: the charge is the ambient medium's beat alone, so the cell that
			// performs the strike is not merely dark here, it is absent.
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			frontUnits += track.params.speed * frame.drive * (frame.dtMs / 1000);
			const phase = seedPhase + frontUnits * BURST_CELL.phasePerUnit;

			const thinning = clamp(frontUnits / BURST_CELL.bandFadeUnits);
			const band = BURST_CELL.band.near + (BURST_CELL.band.far - BURST_CELL.band.near) * thinning;
			shock.setRing({
				inner: Math.max(0, frontUnits - band),
				outer: frontUnits,
				alpha: SHOCK_PRESENCE[frame.beat](frame.beatT) * BURST_CELL.shockAlpha,
				phase,
				height: Math.min(
					track.params.rise * frontUnits * BURST_CELL.liftPerUnit,
					BURST_CELL.maxLiftUnits
				)
			});

			// The emission envelope is one hump confined to the strike, which is
			// exactly the flash's life: it needs no beat table of its own.
			const bloom = shapeOf(frame.emission, track.emission.gain);
			flash.setFlare({
				radius: BURST_CELL.flash.radius,
				height:
					BURST_CELL.flash.restingHeight +
					(BURST_CELL.flash.heightUnits - BURST_CELL.flash.restingHeight) * bloom,
				alpha: bloom * BURST_CELL.flashAlpha,
				phase
			});
		},
		dispose() {
			group.clear();
			shock.dispose();
			flash.dispose();
		}
	};
}
