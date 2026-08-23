/**
 * @file The fan cell: R-07's plane-hugging dispersion, performed as a sector
 * sheet, and R-13's routed vessel performed by the same cell off its own params.
 *
 * A sheet per dispersion sign, pointed where that sign faced, spreading outward
 * from the aperture core with a serrated leading edge and radial streaks that
 * scroll on the same advance the edge runs on. R-08 is why it looks unhurried:
 * the fan's drive is a `leak`, so the front is still moving when a jet's has
 * stopped.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                    |
 * | --------- | ----------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.    |
 * | strike    | the sheet snaps open and its lip rears into a bow wave.      |
 * | body      | it runs outward and thins, shedding slivers off the front.   |
 * | release   | it commits: the root lets go and the sheet becomes a band.   |
 * | afterglow | the band fades where it stands and the garnish goes out.     |
 *
 * @example
 * const fan = createFanCell(track, { seed, look, quality });
 */

import { createFanSheet, type FanSector } from './forms/fanSheet.js';
import { createFanSparks } from './forms/fanSparks.js';
import { mulberry32 } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellContext, CellFrame } from './cell.js';
import type { Beat, Site, Track } from '../../types.js';

const FAN_CELL = {
	/** Seal units of sheet behind the front before it has run anywhere. */
	band: 0.7,
	/** Fraction of the aperture core the sheet's root sits at. */
	rootCore: 0.55,
	/** Turns of radial pattern per seal unit the front advances. */
	turnsPerUnit: 0.7,
	/** How much further the lip rides per seal unit the front has run. */
	liftPerUnit: 0.3,
	/** How much of its share of the seal one sector actually opens. */
	sectorFill: 0.62,
	/** Ridges around the seal before the fold snaps them. */
	streaks: 9,
	/** Below this a facing is the reading's "not trusted" zero (R-06). */
	facingFloor: 1e-3,
	alpha: { sheet: 0.85, sparks: 0.8 }
} as const;

/** How present the sheet is through each beat. */
const FAN_PRESENCE: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: (t) => 1 - 0.25 * t,
	release: (t) => 0.75 + 0.15 * t,
	afterglow: (t) => 0.9 * (1 - t) * (1 - t)
};

/** Where the sheet's inner edge sits, as a fraction of the way out to the front. */
const FAN_ROOT: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: () => 0,
	body: (t) => 0.12 * t,
	release: (t) => 0.12 + 0.5 * t,
	afterglow: (t) => 0.62 + 0.3 * t
};

/** How hard the lip rears off the paper, as a multiple of the track's own `rise`. */
const FAN_LIP: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => 0.35 + 0.85 * t,
	body: (t) => 1.2 - 0.45 * t,
	release: (t) => 0.75 - 0.2 * t,
	afterglow: (t) => 0.55 - 0.35 * t
};

/** An envelope's curve value, 0..1, with its gain divided back out. */
function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

/** Which way one dispersion sign pours: where it faced, or where it sat when it was not trusted. */
function bearingOf(site: Site): number {
	const trusted = Math.hypot(site.facing.x, site.facing.y) > FAN_CELL.facingFloor;
	const heading = trusted ? site.facing : site.at;
	return Math.atan2(heading.y, heading.x);
}

/**
 * One sector per drawn dispersion sign. A fan no sign asked for (R-13's routed
 * vessel) opens the whole seal instead, because it has no arrangement to honor.
 */
function sectorsFor(sites: readonly Site[]): FanSector[] {
	if (sites.length === 0) {
		return [{ bearing: 0, halfAngle: Math.PI }];
	}
	const halfAngle = Math.min(Math.PI, (Math.PI / sites.length) * FAN_CELL.sectorFill);
	return sites.map((site) => ({ bearing: bearingOf(site), halfAngle }));
}

/** Ridges around the seal, snapped onto the plan's fold so they land on the ink. */
function streaksFor(symmetry: number | null): number {
	if (!symmetry || symmetry < 1) {
		return FAN_CELL.streaks;
	}
	return Math.max(symmetry, Math.round(FAN_CELL.streaks / symmetry) * symmetry);
}

export function createFanCell(track: Track<'fan'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const look = ctx.look[track.look];
	const material = ctx.look.material;
	const params = track.params;
	const sectors = sectorsFor(params.sites);

	const sheet = createFanSheet({
		look,
		material,
		sectors,
		streaks: streaksFor(params.symmetry),
		sideFade: params.sites.length > 0 ? 1 : 0
	});
	// The look table's own word for a fleck thrown off the body, which is what a
	// sliver leaving the front is.
	const sparks = createFanSparks({ look: ctx.look.ember, material, sectors, rng });
	sheet.mesh.name = 'fan-sheet';
	sparks.mesh.name = 'fan-sparks';

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(sheet.mesh, sparks.mesh);

	const sparkSize = material.ribbonWidth * 0.9;
	// A sloppier seal throws its garnish further off the edge. Quality buys form
	// here and nothing else: the score already paid for strength.
	const sparkLift = params.ceiling * (0.5 + 0.5 * (1 - clamp(ctx.quality)));

	/** Seal units the front has run, and turns the sheet has been stirred through. */
	let spreadUnits = 0;
	let swirlTurns = 0;

	return {
		group,
		update(frame: CellFrame) {
			// R-01: nothing the seal manifests shows in the charge.
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			const seconds = frame.dtMs / 1000;
			spreadUnits += params.speed * frame.drive * seconds;
			swirlTurns += (params.swirl * frame.drive * seconds) / (Math.PI * 2);
			// R-13's stand-in stirs rather than spreads, and a stirred sheet's pattern
			// turns with the geometry it is drawn on.
			group.rotation.z = swirlTurns * Math.PI * 2;

			const flow = spreadUnits * FAN_CELL.turnsPerUnit;
			const density = 0.6 + 0.4 * shapeOf(frame.emission, track.emission.gain);
			const presence = FAN_PRESENCE[frame.beat](frame.beatT) * density;
			const outer = params.core + FAN_CELL.band + spreadUnits;
			const root = FAN_ROOT[frame.beat](frame.beatT);

			const lip = FAN_LIP[frame.beat](frame.beatT) * (1 + FAN_CELL.liftPerUnit * spreadUnits);
			sheet.setSweep({
				inner: params.core * FAN_CELL.rootCore * (1 - root) + outer * root,
				outer,
				// R-07 caps the climb at the ceiling: a fan hugs the plane however far
				// it runs, and only its lip ever leaves the paper.
				lift: Math.min(params.rise * lip, params.ceiling),
				alpha: presence * FAN_CELL.alpha.sheet,
				flow
			});
			sparks.setSpray({
				outer,
				lift: sparkLift,
				size: sparkSize,
				alpha: presence * FAN_CELL.alpha.sparks,
				// The rim's whole travel, radial and tangential, so a stirred vessel
				// still throws slivers off an edge that is going somewhere.
				flow: flow + Math.abs(swirlTurns)
			});
		},
		dispose() {
			group.clear();
			sheet.dispose();
			sparks.dispose();
		}
	};
}
