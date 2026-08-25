/**
 * @file `TrackFlow` — what one cell tells the substrate each step: which mouth
 * its tracers are born from, where its form stands, and the kind-shaped forces
 * they feel on top of their element's own physics. The KIND says where matter
 * goes; the ELEMENT (`elements.ts`) says how it moves on the way.
 *
 * Pure data and pure functions, no three.js, so a whole cast performs in
 * plain Node for the golden tier.
 */

import { smooth01, vnoise } from './noise.js';
import type { MotionSpec } from './elements.js';

/** The seven mouths a tracer can be born from. One per archetype. */
export const SPAWN = {
	column: 'column',
	splash: 'splash',
	sector: 'sector',
	swirl: 'swirl',
	hover: 'hover',
	sink: 'sink',
	medium: 'medium'
} as const;

export type SpawnKind = (typeof SPAWN)[keyof typeof SPAWN];

/** Sites a sector mouth may honor: up to four drawn signs, packed x,y,fx,fy. */
export const MAX_SITES = 4;

export interface TrackFlow {
	spawn: SpawnKind;
	/** Where the form is rooted, seal space. */
	originX: number;
	originY: number;
	originZ: number;
	/** Unit axis the form stands along. The jet's aim; +z for everything else. */
	axisX: number;
	axisY: number;
	axisZ: number;
	/** Seal units from the axis the body holds at its foot. */
	footprint: number;
	/** Seal units along the axis the body spends itself over. */
	reach: number;
	/** Seal units per second at the mouth, drive already applied. */
	speed: number;
	/** 0..1 share of the element's spawn rate this channel is asking for. */
	emission: number;
	/** The strike's overpressure, 0..1. Boosts spawn, launch and turbulence. */
	punch: number;
	/** Multiplier on how fast airborne mass ages. Rises through the release. */
	burn: number;
	/** 0..1 how drained the ground pool is. The afterglow dries it out. */
	drain: number;
	/** Radians per second of kind-owned rotation about the axis, on top of the element's. */
	swirl: number;
	/** Signed radial acceleration toward the `pool` ring. Positive draws inward. */
	sink: number;
	/** Ring radius the sink gathers at. Matter is pushed back out of the exact center. */
	pool: number;
	/** Containment: outside `holdRadius` of the origin, drawn back on at this rate. */
	gather: number;
	holdRadius: number;
	/** Seal units above the paper the flow is pushed back under. Zero is no lid. */
	ceiling: number;
	/** Lateral drag, seal units per second squared. */
	driftX: number;
	driftY: number;
	/** Multipliers on the element's pinch and turbulence, so a kind can soften them. */
	pinchMul: number;
	turbMul: number;
	/**
	 * Multiplier on the element's gravity and buoyancy. The ambient medium is
	 * near-weightless whatever its element weighs; everything else leaves it 1.
	 */
	weightMul: number;
	/**
	 * Fraction of the footprint the pinch boundary narrows away by full height.
	 * A column tapers; a funnel flares, which is the same term negative.
	 */
	narrow: number;
	/** Multiplier on the element's tracer life. The burst runs a short fuse. */
	lifeMul: number;
	/** 0..1 weight this channel's tracers deposit into the skin at. */
	deposit: number;
	/** Seeded phase for the standing boundary lobes, fixed per cell. */
	lobePhase: number;
	/** How far the boundary wanders, as a fraction of itself. Quality's dial. */
	wander: number;
	siteCount: number;
	sites: Float32Array;
}

/** A flow at rest: no mouth open, unit axis up, every kind force at zero. */
export function blankFlow(): TrackFlow {
	return {
		spawn: SPAWN.column,
		originX: 0,
		originY: 0,
		originZ: 0,
		axisX: 0,
		axisY: 0,
		axisZ: 1,
		footprint: 0.4,
		reach: 1,
		speed: 0,
		emission: 0,
		punch: 0,
		burn: 1,
		drain: 0,
		swirl: 0,
		sink: 0,
		pool: 0.5,
		gather: 0,
		holdRadius: 0,
		ceiling: 0,
		driftX: 0,
		driftY: 0,
		pinchMul: 1,
		turbMul: 1,
		weightMul: 1,
		narrow: 0.62,
		lifeMul: 1,
		deposit: 1,
		lobePhase: 0,
		wander: 0.6,
		siteCount: 0,
		sites: new Float32Array(MAX_SITES * 4)
	};
}

/**
 * The boundary the pinch pulls toward: the element's footprint narrowed with
 * height, wobbled by the flow's own wander and two standing lobes so no cast
 * wears a nameable bell. `hn` is height as a fraction of reach.
 */
export function boundaryAt(
	flow: TrackFlow,
	x: number,
	y: number,
	hn: number,
	tSec: number
): number {
	const angle = Math.atan2(y, x);
	const wob =
		1 +
		flow.wander * 0.5 * vnoise(x * 1.5, y * 1.5, tSec * 0.6 + hn * 1.3) +
		0.3 * Math.sin(angle * 3 + flow.lobePhase + hn * 1.1) * flow.wander +
		0.22 * Math.sin(angle * 2 - flow.lobePhase + hn * 1.35) * flow.wander;
	return (flow.footprint * (1 - flow.narrow * smooth01(hn / 0.95)) + 0.04) * Math.max(0.4, wob);
}

/** What a spawn writes: position, velocity, and a life multiplier. */
export interface SpawnSite {
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	life: number;
}

/** Basis vectors perpendicular to the flow axis, for mouths that ring it. */
function axisBasis(flow: TrackFlow): {
	ux: number;
	uy: number;
	uz: number;
	wx: number;
	wy: number;
	wz: number;
} {
	// The axis is near +z for every kind but an aimed jet, so crossing with +x
	// or +y is stable; pick whichever is less parallel.
	const ax = flow.axisX;
	const ay = flow.axisY;
	const az = flow.axisZ;
	let ux: number;
	let uy: number;
	let uz: number;
	if (Math.abs(az) < 0.9) {
		// axis x z-hat
		ux = ay;
		uy = -ax;
		uz = 0;
	} else {
		// axis x x-hat
		ux = 0;
		uy = az;
		uz = -ay;
	}
	const un = Math.hypot(ux, uy, uz) || 1;
	ux /= un;
	uy /= un;
	uz /= un;
	const wx = ay * uz - az * uy;
	const wy = az * ux - ax * uz;
	const wz = ax * uy - ay * ux;
	return { ux, uy, uz, wx, wy, wz };
}

/**
 * Fills one birth site for this flow's mouth. `rng` is the channel's own
 * stream; `tMs` phases the precessing sub-jets water and earth braid into.
 */
export function spawnAt(
	flow: TrackFlow,
	spec: MotionSpec,
	rng: () => number,
	tMs: number,
	out: SpawnSite
): void {
	out.life = 1;
	switch (flow.spawn) {
		case SPAWN.column: {
			// The element's own launch: a disc at the mouth, thrown along the axis
			// with the row's rise and lean, braided into sub-jets where the row
			// asks (water's arcs, earth's lobs).
			const { ux, uy, uz, wx, wy, wz } = axisBasis(flow);
			let leanU: number;
			let leanW: number;
			if (spec.jets > 0) {
				const jet = Math.floor(rng() * spec.jets);
				const angle =
					(jet / spec.jets) * Math.PI * 2 + (tMs / 1000) * spec.jetSpinRadS + (rng() - 0.5) * 0.5;
				leanU = Math.cos(angle);
				leanW = Math.sin(angle);
			} else {
				const angle = rng() * Math.PI * 2;
				leanU = Math.cos(angle);
				leanW = Math.sin(angle);
			}
			const mouth = spec.mouth * flow.footprint * Math.sqrt(rng());
			let ma: number;
			if (flow.siteCount > 0 && rng() < 0.55) {
				// Bias the foot toward the drawn columns' own azimuths, so three
				// signs read as a three-lobed foot rather than one averaged mouth.
				const pick = Math.floor(rng() * flow.siteCount);
				ma = Math.atan2(flow.sites[pick * 4 + 1], flow.sites[pick * 4]) + (rng() - 0.5) * 0.9;
			} else {
				ma = rng() * Math.PI * 2;
			}
			const mu = Math.cos(ma) * mouth;
			const mw = Math.sin(ma) * mouth;
			out.x = flow.originX + ux * mu + wx * mw;
			out.y = flow.originY + uy * mu + wy * mw;
			out.z = flow.originZ + uz * mu + wz * mw + 0.01 + 0.05 * rng();
			const rise = flow.speed * (spec.riseLo + rng() * (spec.riseHi - spec.riseLo));
			const radial = flow.speed * (spec.radialLo + rng() * (spec.radialHi - spec.radialLo));
			out.vx = flow.axisX * rise + (ux * leanU + wx * leanW) * radial;
			out.vy = flow.axisY * rise + (uy * leanU + wy * leanW) * radial;
			out.vz = flow.axisZ * rise + (uz * leanU + wz * leanW) * radial;
			return;
		}
		case SPAWN.splash: {
			// The strike: born across the whole footprint, thrown radially at a
			// wild spread of speeds so no coherent front survives, on a short fuse.
			const r = flow.footprint * 0.9 * Math.sqrt(rng());
			const a = rng() * Math.PI * 2;
			const dx = Math.cos(a);
			const dy = Math.sin(a);
			out.x = flow.originX + dx * r;
			out.y = flow.originY + dy * r;
			out.z = 0.02 + 0.06 * rng();
			const throwSpeed = flow.speed * (0.5 + 1.6 * rng()) * (1 + 1.4 * flow.punch);
			out.vx = dx * throwSpeed;
			out.vy = dy * throwSpeed;
			out.vz = flow.speed * (0.1 + 0.5 * rng());
			out.life = flow.lifeMul;
			return;
		}
		case SPAWN.sector: {
			// Dispersion: born low along the drawn signs' bearings (or all around
			// when no sign asked), running outward and hugging the plane.
			let bearing: number;
			if (flow.siteCount > 0) {
				const pick = Math.floor(rng() * flow.siteCount);
				const fx = flow.sites[pick * 4 + 2];
				const fy = flow.sites[pick * 4 + 3];
				const trusted = Math.hypot(fx, fy) > 1e-4;
				const base = trusted
					? Math.atan2(fy, fx)
					: Math.atan2(flow.sites[pick * 4 + 1], flow.sites[pick * 4]);
				bearing = base + (rng() - 0.5) * 1.1;
			} else {
				bearing = rng() * Math.PI * 2;
			}
			const r = flow.pool + rng() * 0.35;
			out.x = Math.cos(bearing) * r;
			out.y = Math.sin(bearing) * r;
			out.z = 0.02 + 0.1 * rng();
			const run = flow.speed * (0.6 + 0.7 * rng());
			out.vx = Math.cos(bearing) * run;
			out.vy = Math.sin(bearing) * run;
			out.vz = flow.speed * 0.12 * rng();
			return;
		}
		case SPAWN.swirl: {
			// The whirl: born on the wall, already turning, with the updraft the
			// kind wrote. The eye stays hollow because the wall is where birth is.
			const a = rng() * Math.PI * 2;
			const r = flow.footprint * (0.8 + 0.35 * rng());
			const sense = Math.sign(flow.swirl) || 1;
			out.x = Math.cos(a) * r;
			out.y = Math.sin(a) * r;
			out.z = 0.02 + 0.3 * rng() * flow.reach;
			const tangential = Math.abs(flow.swirl) * r * (0.7 + 0.5 * rng());
			out.vx = -Math.sin(a) * tangential * sense;
			out.vy = Math.cos(a) * tangential * sense;
			out.vz = flow.speed * (0.3 + 0.5 * rng());
			return;
		}
		case SPAWN.hover: {
			// The held ball: born through the shell around the locus, above and
			// below alike, nearly at rest. The gather does the keeping.
			const a = rng() * Math.PI * 2;
			const cosb = 2 * rng() - 1;
			const sinb = Math.sqrt(Math.max(0, 1 - cosb * cosb));
			const r = Math.max(0.05, flow.holdRadius) * (0.3 + 0.7 * Math.cbrt(rng()));
			out.x = flow.originX + Math.cos(a) * sinb * r;
			out.y = flow.originY + Math.sin(a) * sinb * r;
			out.z = Math.max(0.03, flow.originZ + cosb * r);
			out.vx = (rng() - 0.5) * 0.2;
			out.vy = (rng() - 0.5) * 0.2;
			out.vz = (rng() - 0.5) * 0.2 + flow.speed * 0.3;
			return;
		}
		case SPAWN.sink: {
			// The pull: the medium arrives as a few dense streams bending in to
			// the mouth, not as a thin annulus — a population spread over the
			// whole rim can never reach merge density, and unmerged deposits are
			// chips. Four slowly precessing streams, born anywhere along their
			// run. Reversed, the same streams are born at the mouth and pushed
			// away: one signed kernel, two ends of one run.
			const inward = flow.sink >= 0;
			const stream = Math.floor(rng() * 4);
			const a =
				(stream / 4) * Math.PI * 2 + flow.lobePhase + (tMs / 1000) * 0.22 + (rng() - 0.5) * 0.42;
			const r = inward ? flow.pool + (2.0 - flow.pool) * rng() : flow.pool * (0.4 + 0.6 * rng());
			out.x = Math.cos(a) * r;
			out.y = Math.sin(a) * r;
			out.z = 0.02 + 0.08 * rng();
			const lean = flow.speed * (0.45 + 0.4 * rng()) * (inward ? -1 : 1);
			out.vx = Math.cos(a) * lean;
			out.vy = Math.sin(a) * lean;
			out.vz = 0.02 * rng();
			return;
		}
		case SPAWN.medium: {
			// R-10's world: a wide slow annulus of motes for the ambient washes.
			const a = rng() * Math.PI * 2;
			const r = 0.5 + 1.1 * Math.sqrt(rng());
			out.x = Math.cos(a) * r;
			out.y = Math.sin(a) * r;
			out.z = 0.02 + 0.45 * (flow.ceiling > 0 ? flow.ceiling : 0.4) * rng();
			const lean = flow.speed * (0.2 + 0.4 * rng());
			out.vx = -Math.cos(a) * lean;
			out.vy = -Math.sin(a) * lean;
			out.vz = (rng() - 0.5) * 0.05;
			return;
		}
	}
}
