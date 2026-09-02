/**
 * @file The element behavior matrix: every number that makes the eight rows
 * MOVE differently. `MOTION` is the physics a row's tracers obey and `SKIN` is
 * how its marching-cubes field fuses; how a row is painted lives beside it in
 * `pigment.ts`. Fire, water and wind are the bake-off's approved rows carried
 * over; the other five are designed here in the same table style, argued from
 * their look rows' own `@file` blocks and, since the canon physics pass in
 * `docs/animation-volume.md`, from the manga panels each row's comment names.
 *
 * The KIND says where matter goes (a jet rises on its axis, a vortex orbits
 * its eye); the ELEMENT says how the medium moves on the way and how its body
 * reads. That split is the whole reason this file exists: a cell never touches
 * these numbers, and an art pass on an element never touches a cell.
 */

import type { ElementId } from '../../types.js';

/** The rows this table carries: the five elements, two sigils, and the fallback. */
export type VolumeElement =
	| 'fire'
	| 'water'
	| 'wind'
	| 'earth'
	| 'light'
	| 'crystal'
	| 'aeroform'
	| 'inert';

/**
 * The row a cast performs with, resolved the way the look table resolves art:
 * sigil row, else element row, else the designed `inert` default (R-11).
 */
export function volumeElementFor(sigil: string | null, element: ElementId | null): VolumeElement {
	if (sigil && sigil in MOTION) {
		return sigil as VolumeElement;
	}
	if (element && element in MOTION) {
		return element as VolumeElement;
	}
	return 'inert';
}

/** Floor behavior for the rows whose matter stays where it lands. */
export interface PoolSpec {
	/** Seal units above the paper the floor sits at. */
	floorZ: number;
	/** Fraction of impact speed kept on the bounce. */
	bounce: number;
	/** Outward acceleration of the settled mass. Water spreads; earth does not. */
	spread: number;
	/**
	 * Seal units where the settled spread runs out. Without it a long fed cast
	 * grows its puddle to the volume grid's own walls, and the skin clips it
	 * into a straight-edged glass slab.
	 */
	edge: number;
	/** Per-second horizontal damping once settled. */
	dragXY: number;
	/** How fast settled mass ages relative to airborne mass. Low is persistent. */
	ageRate: number;
	/** Extra ageing at full drain, so the afterglow dries the ground out. */
	drainAgeRate: number;
	/**
	 * Seal units of thickness the landed mass heaps to where it crowds
	 * (`HEAP` in tuning.ts says how many neighbours that takes). Earth mounds;
	 * a puddle lies all but flat.
	 */
	heap: number;
	/**
	 * Speed below which airborne matter sets where it stands, seal units per
	 * second. Zero settles on the floor alone. Crystal's growth that has
	 * stopped is lattice, and lattice does not drift or melt.
	 */
	settleSpeed: number;
}

/**
 * Motion: the physics one element's tracers obey, whatever kind is steering
 * them. Speeds are multiples of the track's own nozzle speed; accelerations
 * are seal units per second squared.
 */
export interface MotionSpec {
	/** Spawn disc radius as a fraction of the track's footprint. */
	mouth: number;
	/** Launch speed along the track axis, x nozzle speed. */
	riseLo: number;
	riseHi: number;
	/** Launch lean off the axis, x nozzle speed. */
	radialLo: number;
	radialHi: number;
	/** Distinct sub-jets a column launch braids into, and their precession. */
	jets: number;
	jetSpinRadS: number;
	/** Acceleration along the track axis on hot mass. Fire's identity. */
	buoyancy: number;
	/** Downward acceleration. Water and earth's identity. */
	gravity: number;
	drag: number;
	/** Curl-noise gain and spatial scale. Wind runs large-scale, crystal none. */
	turbulence: number;
	turbScale: number;
	/** Coherent lateral sway: gusts that bend the whole body at once. */
	gust: number;
	/** Idle rotation about the track axis, radians per second at radius one. */
	swirl: number;
	/** Pull toward the column boundary. Fire keeps a column; wind does not. */
	pinch: number;
	lifeLo: number;
	lifeHi: number;
	/** Above this fraction of reach, age runs faster and the fade melts. */
	tearFrom: number;
	tearRate: number;
	/** Kill height, x reach. */
	heightCap: number;
	/** Floor behavior. Water pools, earth mounds, crystal sets where it stops. */
	pool: PoolSpec | null;
	/** Tracer births per second at full emission, before the pool division. */
	spawnPerSec: number;
	/**
	 * How much of the levitation pair the element's own manifestation takes:
	 * ground truth section 6's per-element grip. One is held as a ball; zero
	 * streams through the grip as an updraft, is never held, and so never fills
	 * it, which is why a wind seal keeps pumping. Only a hold's hover mouth and
	 * gather read it.
	 */
	grip: number;
}

export const MOTION: Record<VolumeElement, MotionSpec> = {
	// Buoyant and turbulent: accelerates upward, flickers, tips tear and melt.
	// Livelier than the bake-off frame: more curl, a lower tear line and a
	// faster tear rate, so the crown turns over instead of standing chunky.
	fire: {
		mouth: 1.0,
		riseLo: 0.45,
		riseHi: 1.6,
		radialLo: 0.0,
		radialHi: 0.08,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 3.4,
		gravity: 0,
		drag: 1.6,
		turbulence: 3.1,
		turbScale: 1.3,
		gust: 0,
		swirl: 0.6,
		pinch: 6.0,
		lifeLo: 0.55,
		lifeHi: 1.25,
		tearFrom: 0.68,
		tearRate: 3.0,
		heightCap: 1.38,
		pool: null,
		spawnPerSec: 1500,
		grip: 1
	},
	// Heavy and cohesive: launched in braided sub-jets, bent over by gravity,
	// pooling on the paper and spreading. The pool block is the puddle.
	water: {
		mouth: 0.34,
		riseLo: 1.2,
		riseHi: 1.75,
		radialLo: 0.28,
		radialHi: 0.62,
		jets: 3,
		jetSpinRadS: 0.5,
		buoyancy: 0,
		gravity: 3.3,
		drag: 0.55,
		turbulence: 0.45,
		turbScale: 1.0,
		gust: 0,
		swirl: 0.15,
		pinch: 0,
		lifeLo: 1.7,
		lifeHi: 2.9,
		tearFrom: 2.0,
		tearRate: 1,
		heightCap: 1.0,
		pool: {
			floorZ: 0.02,
			bounce: 0.14,
			spread: 0.85,
			edge: 1.6,
			dragXY: 2.1,
			ageRate: 0.28,
			drainAgeRate: 3.2,
			heap: 0.05,
			settleSpeed: 0
		},
		spawnPerSec: 1200,
		grip: 1
	},
	// Nearly bodiless: very fast, curl at grass-blade scale, coherent gusts
	// that bend the whole streak at once. The motion is the identity; the
	// pigment barely shows, and the skin fuses its beads into ribbons. The
	// crown melts low, or the gusts fling its tip off as countable chunks.
	// Grip zero: wind is ambient fluid streaming through a levitation pair
	// (section 6), the sylph shoes' strut, never a held ball.
	wind: {
		mouth: 0.5,
		riseLo: 2.0,
		riseHi: 3.0,
		radialLo: 0.0,
		radialHi: 0.1,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 0.5,
		gravity: 0,
		drag: 0.5,
		turbulence: 1.1,
		turbScale: 0.55,
		gust: 4.2,
		swirl: 0.7,
		pinch: 1.3,
		lifeLo: 0.5,
		lifeHi: 0.95,
		tearFrom: 0.8,
		tearRate: 2.6,
		heightCap: 1.45,
		pool: null,
		spawnPerSec: 1500,
		grip: 0
	},
	// A heave, not a fountain: the sigil manipulates stone and sand rather than
	// creating it (canon shows sand bridges and bent walls, never thrown
	// clods), so the launch is slow and thick under a hard gravity, four wide
	// lobes precessing slowly, and the floor block piles instead of spreading
	// and heaps into a persistent mound the afterglow then dries out.
	earth: {
		mouth: 0.55,
		riseLo: 0.55,
		riseHi: 1.15,
		radialLo: 0.05,
		radialHi: 0.3,
		jets: 4,
		jetSpinRadS: 0.2,
		buoyancy: 0,
		gravity: 5.0,
		drag: 0.5,
		turbulence: 0.12,
		turbScale: 0.8,
		gust: 0,
		swirl: 0,
		pinch: 0,
		lifeLo: 2.4,
		lifeHi: 3.8,
		tearFrom: 2.0,
		tearRate: 1,
		heightCap: 1.0,
		pool: {
			floorZ: 0.03,
			bounce: 0.08,
			spread: 0.08,
			edge: 1.1,
			dragXY: 8,
			ageRate: 0.05,
			drainAgeRate: 2.6,
			heap: 0.4,
			settleSpeed: 0
		},
		spawnPerSec: 1000,
		grip: 1
	},
	// A beam, not a plume: light radiates rather than convects, so it leaves
	// the mouth fast and straight with next to no buoyancy, stir, sway or
	// swirl, is pinched hard onto its axis, and lives briefly, so the shaft
	// stands only while the seal feeds it and is gone the moment it stops
	// (canon's light beam ends where the spell ends; it never lingers as
	// smoke). The skin's long smear turns the fast beads into the shaft.
	// Brightness is the pigment's job, never a bloom.
	light: {
		mouth: 0.5,
		riseLo: 1.5,
		riseHi: 2.1,
		radialLo: 0.0,
		radialHi: 0.03,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 0.2,
		gravity: 0,
		drag: 0.8,
		turbulence: 0.16,
		turbScale: 0.7,
		gust: 0,
		swirl: 0,
		pinch: 5,
		lifeLo: 0.45,
		lifeHi: 0.8,
		tearFrom: 0.95,
		tearRate: 2.2,
		heightCap: 1.9,
		pool: null,
		spawnPerSec: 1400,
		grip: 1
	},
	// Grown, not thrown: pillars. Matter leaves on six fixed azimuths leaning
	// out from the mouth at a wide spread of speeds, decelerates hard, and the
	// moment it stops it sets where it stands (the pool block's `settleSpeed`),
	// so each ray paints a standing pillar from its foot to wherever its
	// fastest growth reached, fused with its neighbours at the base, the way
	// canon's petrification and crystal shard grow jagged and then hold.
	// Nothing pinches the rays back onto a column, no weight bends them, and
	// set lattice never melts: it stands until the afterglow drains it. The
	// angular read is the skin's row.
	crystal: {
		mouth: 0.4,
		riseLo: 0.5,
		riseHi: 1.3,
		radialLo: 0.15,
		radialHi: 0.45,
		jets: 6,
		jetSpinRadS: 0,
		buoyancy: 0,
		gravity: 0,
		drag: 2.4,
		turbulence: 0.1,
		turbScale: 0.4,
		gust: 0,
		swirl: 0,
		pinch: 0,
		lifeLo: 3.0,
		lifeHi: 4.2,
		tearFrom: 2.0,
		tearRate: 1,
		heightCap: 1.3,
		pool: {
			floorZ: 0.02,
			bounce: 0,
			spread: 0,
			edge: 1.3,
			dragXY: 30,
			ageRate: 0.02,
			drainAgeRate: 3.5,
			heap: 0.12,
			settleSpeed: 0.22
		},
		spawnPerSec: 700,
		grip: 1
	},
	// Wind read as a volume rather than as a path: slower, softer, longer
	// lived, its gusts halved and its body fatter. Barely inked by design.
	// Its crown melts low like wind's, or the tip breaks into chunks. The
	// sigil creates air but does not move it, so a levitation pair gets a
	// partial grip on the body it makes: mostly a wash, part of it held.
	aeroform: {
		mouth: 0.7,
		riseLo: 1.4,
		riseHi: 2.2,
		radialLo: 0.0,
		radialHi: 0.1,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 0.6,
		gravity: 0,
		drag: 0.55,
		turbulence: 0.8,
		turbScale: 0.5,
		gust: 2.2,
		swirl: 0.5,
		pinch: 0.9,
		lifeLo: 0.8,
		lifeHi: 1.5,
		tearFrom: 0.85,
		tearRate: 2.4,
		heightCap: 1.4,
		pool: null,
		spawnPerSec: 1400,
		grip: 0.4
	},
	// R-11's designed default: a small, low-energy, desaturated mass. Present
	// on purpose — "manifests nothing" is a look — and quiet on purpose.
	inert: {
		mouth: 0.6,
		riseLo: 0.5,
		riseHi: 0.9,
		radialLo: 0.0,
		radialHi: 0.06,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 0.7,
		gravity: 0.15,
		drag: 1.4,
		turbulence: 0.9,
		turbScale: 1.0,
		gust: 0,
		swirl: 0.3,
		pinch: 3.5,
		lifeLo: 0.5,
		lifeHi: 1.0,
		tearFrom: 0.8,
		tearRate: 2.0,
		heightCap: 1.0,
		pool: null,
		spawnPerSec: 850,
		grip: 1
	}
};

/**
 * Volume field shaping for the marching-cubes skin. This shapes the FIELD, not
 * the color: water's low iso + smear + smoothing + cohesion is what fuses it
 * into one merged rounded body, and crystal's sparse cohesion with a high
 * loner floor is the one row where standing facets are a choice.
 */
export interface SkinSpec {
	/** Multiplier on the polygonizer's isolation. Lower is fatter, merges sooner. */
	isoScale: number;
	/** Multiplier on the velocity smear. High turns fast beads into strands. */
	smearScale: number;
	/** Field diffusion intensity and passes. Bridges blobs into one surface. */
	smooth: number;
	smoothPasses: number;
	/** Multiplier on the cohesion pull toward the local centroid. */
	cohesion: number;
	/** Per-ball deposit weight. Wind's few streaks are fat so they fuse. */
	strengthScale: number;
	/** Deposit weight floor for isolated balls. Low melts loners away. */
	loner: number;
}

export const SKIN: Record<VolumeElement, SkinSpec> = {
	// The body stays raw lively metaballs, but an isolated ember melts away
	// instead of rendering as a stray grid-sized chip.
	fire: {
		isoScale: 1.0,
		smearScale: 1.05,
		smooth: 0.3,
		smoothPasses: 1,
		cohesion: 0.5,
		strengthScale: 1,
		loner: 0.12
	},
	water: {
		isoScale: 0.5,
		smearScale: 1.5,
		smooth: 0.85,
		smoothPasses: 2,
		cohesion: 1,
		strengthScale: 1,
		loner: 0.45
	},
	// Beads that ride a shared gust fuse into a ribbon; stragglers simply are
	// not there. The fat deposits are what make few streaks read as ribbons.
	wind: {
		isoScale: 0.9,
		smearScale: 1.15,
		smooth: 0.55,
		smoothPasses: 1,
		cohesion: 0.35,
		strengthScale: 1.7,
		loner: 0.12
	},
	// Fat compact blobs, no streaking, one smoothing pass: boulders that merge
	// into rubble where they pile and stay rounded where they fly.
	earth: {
		isoScale: 0.85,
		smearScale: 0.5,
		smooth: 0.35,
		smoothPasses: 1,
		cohesion: 0.8,
		strengthScale: 1.35,
		loner: 0.3
	},
	// A soft merged glow-mass with the longest smear in the table, so the rise
	// reads as shafts. Softness comes from the field, never from bloom.
	light: {
		isoScale: 0.75,
		smearScale: 1.8,
		smooth: 0.7,
		smoothPasses: 1,
		cohesion: 0.55,
		strengthScale: 1.2,
		loner: 0.2
	},
	// The chip law leaned into on purpose: no smoothing, sparse cohesion, a
	// high loner floor and chunky deposits, so growth reads faceted. Angular
	// here is a choice; everywhere else it is the named failure.
	crystal: {
		isoScale: 1.2,
		smearScale: 0.9,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0.18,
		strengthScale: 2.0,
		loner: 0.55
	},
	aeroform: {
		isoScale: 0.7,
		smearScale: 0.9,
		smooth: 0.75,
		smoothPasses: 1,
		cohesion: 0.6,
		strengthScale: 1.5,
		loner: 0.15
	},
	inert: {
		isoScale: 1.0,
		smearScale: 0.8,
		smooth: 0.4,
		smoothPasses: 1,
		cohesion: 0.5,
		strengthScale: 0.9,
		loner: 0.2
	}
};
