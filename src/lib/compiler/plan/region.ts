/**
 * @file R-09, the region grammar: the region sign's uncaptioned ten-case
 * diagram as a real function.
 *
 * Resolution is a **ranked rule table**, first match wins, over the classes
 * `chevrons.ts` reads: count, radial position, and the facing class the reading
 * already quantized. Never a threshold on fused geometry, so there is no cliff
 * where 60 degrees of separation reads one way and 59 another.
 *
 * @example
 * const region = resolveRegion(chevrons); // { aperture, exhaust, hardness, reach }
 */

import { clamp } from '../../utils/geometry.js';
import { bearingOf, normalized, readChevrons, type ChevronSet } from './chevrons.js';
import type { Aperture, Region, SignReading, Vec3 } from '../../types.js';

const REGION_TUNING = {
	/** Gate hardness grows with member count; chevron size only scales it (R-09, deferred). */
	hardnessPerMember: 0.18,
	hardnessSizeFloor: 0.5,
	/** reach = 1 + beta * (n - 1). Staging is how extra aligned ink pays off. */
	reachPerExtraMember: 0.25,
	/** The all-outward moat still lifts a little off the plane. */
	moatRise: 0.25,
	/** Geometry for the single-chevron rules. */
	sectorHalfAngleDeg: 55,
	sectorOuter: 1.5,
	bandWidth: 0.5,
	discBias: 0.6
};

const UP: Vec3 = { x: 0, y: 0, z: 1 };
/** Rule 1's exhaust: no preferred direction at all. */
const OMNIDIRECTIONAL: Vec3 = { x: 0, y: 0, z: 0 };

interface RegionRule {
	/** Row number in R-09's table, so a golden can be read against the spec. */
	row: number;
	when: (set: ChevronSet) => boolean;
	resolve: (set: ChevronSet) => { aperture: Aperture; exhaust: Vec3 };
}

/** Ranked. First match wins, and the last row matches everything. */
const REGION_RULES: RegionRule[] = [
	{
		// R-19: two same-sense members fuse into a fence once they span the ring
		// spread. `!agreeing` is what separates a fence from a stack: a radial ring
		// points its members at each other, a shutter stack points them all one way.
		row: 2,
		when: (set) =>
			set.count >= 2 && set.position === 'rim' && set.spreadsRing && !set.agreeing && set.allInward,
		resolve: () => ({ aperture: { kind: 'disc' }, exhaust: UP })
	},
	{
		row: 3,
		when: (set) =>
			set.count >= 2 &&
			set.position === 'rim' &&
			set.spreadsRing &&
			!set.agreeing &&
			set.allOutward,
		resolve: (set) => ({
			aperture: { kind: 'annulus', inner: 1, outer: 1.5 },
			// Radial has no one side, so a symmetric moat cancels to a pure rise.
			exhaust: { ...set.meanFacing, z: REGION_TUNING.moatRise }
		})
	},
	{
		row: 4,
		when: (set) => set.opposedPairs >= 1 && set.position === 'rim' && !set.arc.confined,
		resolve: () => ({ aperture: { kind: 'annulus', inner: 0.85, outer: 1.05 }, exhaust: UP })
	},
	{
		row: 5,
		when: (set) => set.opposedPairs >= 1 && set.arc.confined,
		resolve: (set) => ({
			aperture: {
				kind: 'annulus',
				inner: 0.85,
				outer: 1.05,
				arcDeg: set.arc.arcDeg,
				bearingDeg: set.arc.bearingDeg
			},
			exhaust: UP
		})
	},
	{
		row: 6,
		when: (set) => set.count >= 2 && set.position === 'center' && set.crossed,
		resolve: () => ({ aperture: { kind: 'point', at: { x: 0, y: 0 } }, exhaust: UP })
	},
	{
		row: 7,
		when: (set) => set.count === 1 && set.position === 'rim' && set.allInward,
		resolve: (set) => ({
			aperture: {
				kind: 'disc',
				// The chevron's facing already points across the seal, away from it.
				bias: {
					x: set.meanFacing.x * REGION_TUNING.discBias,
					y: set.meanFacing.y * REGION_TUNING.discBias
				}
			},
			exhaust: UP
		})
	},
	{
		row: 8,
		when: (set) => set.count === 1 && set.position === 'center' && set.allOutward,
		resolve: (set) => ({
			aperture: {
				kind: 'sector',
				// The far side is the side it points at.
				bearingDeg: bearingOf(normalized(set.meanFacing)),
				halfAngleDeg: REGION_TUNING.sectorHalfAngleDeg,
				inner: 0,
				outer: REGION_TUNING.sectorOuter
			},
			exhaust: { ...normalized(set.meanFacing), z: 0 }
		})
	},
	{
		row: 9,
		when: (set) => set.count === 1 && set.position === 'mid' && set.allOutward,
		resolve: (set) => ({
			aperture: {
				kind: 'band',
				normal: normalized(set.meanFacing),
				offset: set.radius,
				width: REGION_TUNING.bandWidth
			},
			exhaust: { ...normalized(set.meanFacing), z: 0 }
		})
	},
	{
		row: 10,
		when: (set) => set.count >= 2 && set.agreeing,
		resolve: (set) => ({
			aperture: { kind: 'disc' },
			exhaust: { ...normalized(set.meanFacing), z: 0 }
		})
	},
	{
		// Row 1 doubles as the default: no chevrons, and every arrangement the
		// table does not name (a tangential fence, say). `resolvePlan` notes it.
		row: 1,
		when: () => true,
		resolve: () => ({ aperture: { kind: 'disc' }, exhaust: OMNIDIRECTIONAL })
	}
];

/** R-09: hardness grows with member count, and chevron size scales hardness only. */
function regionHardness(set: ChevronSet): number {
	return clamp(
		REGION_TUNING.hardnessPerMember *
			set.count *
			(REGION_TUNING.hardnessSizeFloor + (set.power || 0))
	);
}

export interface RegionResolution extends Region {
	/** Which row of R-09's table matched. Row 1 also serves as the default. */
	row: number;
}

/**
 * The valve: which part of the seal disc emits, where it exhausts, how strictly
 * it masks and how far it throws. Region signs contribute no momentum, so this
 * is their entire output.
 */
export function resolveRegion(chevrons: SignReading[]): RegionResolution {
	if (!chevrons.length) {
		return { row: 1, aperture: { kind: 'disc' }, exhaust: OMNIDIRECTIONAL, hardness: 0, reach: 1 };
	}
	const set = readChevrons(chevrons);
	const rule = REGION_RULES.find((candidate) => candidate.when(set)) as RegionRule;
	return {
		row: rule.row,
		...rule.resolve(set),
		hardness: regionHardness(set),
		reach: 1 + REGION_TUNING.reachPerExtraMember * (set.count - 1)
	};
}
