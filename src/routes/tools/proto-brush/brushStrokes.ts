/**
 * @file The population: where a stroke is born, what it is made of, how it
 * smears, and how it dissolves.
 *
 * A stroke is one laid-down mark with a life, not a particle. It is born large
 * enough to overlap its neighbours several times over, it keeps its own velocity
 * so it lags the field and leaves a smear rather than snapping to a streamline,
 * it cools as it ages and climbs, and it fades over most of its life so the mass
 * has no countable edges. The five birth kinds are the only place the arc gets
 * to change what the column is made of.
 */

import { mulberry32, type Rng } from '$lib/cast/rng.js';
import { HEIGHT_FORESHORTENING, PORTAL } from '$lib/portal/portal.js';
import { sampleArc, type ArcSample } from './brushArc.js';
import { sampleFlow, type FlowVec } from './brushFlow.js';
import { MASS_CEILING, pigment } from './brushPalette.js';
import { BRUSH_SLOT, type BrushSlot } from './brushTextures.js';
import type { QuadWrite } from './brushMesh.js';
import type { BrushSpell } from './brushSpell.js';

/** Strokes the pool can hold. The live count peaks a little under it. */
const POOL = 460;
/** Live strokes the column is allowed, so the roar has a ceiling. */
const LIVE_CAP = 400;
/** Fixed integration step, matching the shipped stage's 120Hz. */
const STEP_MS = 1000 / 120;

type BirthKind = 'gather' | 'column' | 'site' | 'burst' | 'crown';

interface Stroke {
	alive: boolean;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	ageMs: number;
	lifeMs: number;
	size: number;
	/** Short axis over long axis. The stamps carry their own proportions; this is jitter. */
	squash: number;
	slot: BrushSlot;
	flip: number;
	angle: number;
	/** Radians this stroke sits off the flow direction, so the crowd never combs. */
	lean: number;
	spin: number;
	inertia: number;
	looseness: number;
	wander: number;
	phase: number;
	flickerRate: number;
	growth: number;
	peak: number;
	heat: number;
	hot: boolean;
}

/** How each birth kind is built. One row per kind, read straight by `spawn`. */
const RECIPE: Record<
	BirthKind,
	{
		size: [number, number];
		life: [number, number];
		peak: [number, number];
		growth: [number, number];
		slots: BrushSlot[];
	}
> = {
	gather: {
		size: [0.44, 1.0],
		life: [1100, 1900],
		peak: [0.14, 0.32],
		growth: [0.2, 0.55],
		slots: [BRUSH_SLOT.wash, BRUSH_SLOT.wash, BRUSH_SLOT.soot, BRUSH_SLOT.streak]
	},
	column: {
		size: [0.19, 0.5],
		life: [700, 1560],
		peak: [0.24, 0.55],
		growth: [0.3, 0.85],
		// Licks give the column its tongues; the washes and smudges between them are
		// what keep it a mass instead of a bouquet of countable shapes.
		slots: [
			BRUSH_SLOT.lick,
			BRUSH_SLOT.lick,
			BRUSH_SLOT.lick,
			BRUSH_SLOT.streak,
			BRUSH_SLOT.streak,
			BRUSH_SLOT.streak,
			BRUSH_SLOT.wash,
			BRUSH_SLOT.wash,
			BRUSH_SLOT.soot,
			BRUSH_SLOT.soot
		]
	},
	site: {
		size: [0.28, 0.6],
		life: [460, 920],
		peak: [0.34, 0.64],
		growth: [0.4, 0.9],
		slots: [BRUSH_SLOT.lick, BRUSH_SLOT.lick, BRUSH_SLOT.streak]
	},
	burst: {
		size: [0.3, 0.78],
		life: [360, 760],
		peak: [0.4, 0.8],
		growth: [0.7, 1.5],
		slots: [BRUSH_SLOT.streak, BRUSH_SLOT.streak, BRUSH_SLOT.lick, BRUSH_SLOT.lick]
	},
	crown: {
		size: [0.55, 1.2],
		life: [1400, 2500],
		peak: [0.1, 0.24],
		growth: [0.45, 1.1],
		slots: [BRUSH_SLOT.soot, BRUSH_SLOT.soot, BRUSH_SLOT.wash, BRUSH_SLOT.lick]
	}
};

/**
 * What a mark laid on the paper itself is made of. A tongue needs somewhere to
 * point, so down at the plate the licks give way to washes and smudges and the
 * foot of the column reads as pigment pooling rather than as a ring of blades.
 */
const BASE_SLOTS: BrushSlot[] = [
	BRUSH_SLOT.wash,
	BRUSH_SLOT.wash,
	BRUSH_SLOT.soot,
	BRUSH_SLOT.streak
];

function between(rng: Rng, min: number, max: number): number {
	return min + rng() * (max - min);
}

function pick<T>(rng: Rng, list: readonly T[]): T {
	return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** Signed sample bunched toward zero, in -1..1. */
function bunched(rng: Rng): number {
	return (rng() + rng() + rng() - 1.5) / 1.5;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

function wrapAngle(value: number): number {
	return value - Math.PI * 2 * Math.round(value / (Math.PI * 2));
}

/** The mass and its hot core, sorted back-to-front and ready to upload. */
export interface ColumnQuads {
	mass: QuadWrite[];
	hot: QuadWrite[];
}

/**
 * The whole column: a fixed pool of strokes advanced on a fixed step, and the
 * two sorted quad lists the layers are written from.
 */
export class BrushColumn {
	readonly #spell: BrushSpell;
	readonly #strokes: Stroke[] = [];
	readonly #quads: QuadWrite[] = [];
	readonly #out: ColumnQuads = { mass: [], hot: [] };
	readonly #tint = { r: 0, g: 0, b: 0 };
	readonly #flow: FlowVec = { x: 0, y: 0, z: 0 };
	#rng: Rng = mulberry32(0xb1a5e);
	#emitDebt = 0;
	#stepsTaken = 0;

	constructor(spell: BrushSpell) {
		this.#spell = spell;
		for (let i = 0; i < POOL; i += 1) {
			this.#strokes.push(blankStroke());
			this.#quads.push(blankQuad());
		}
	}

	/** Drop everything in flight, so the cast can be replayed from the strike. */
	reset(): void {
		for (const stroke of this.#strokes) {
			stroke.alive = false;
		}
		this.#rng = mulberry32(0xb1a5e);
		this.#emitDebt = 0;
		this.#stepsTaken = 0;
	}

	/**
	 * Advances to `tMs` on the cast clock in whole fixed steps. The clock is the
	 * step count times the step, never a running sum, so a scripted capture lands
	 * on the same state the live loop reaches.
	 */
	stepTo(tMs: number): void {
		const target = Math.floor(Math.max(0, tMs) / STEP_MS);
		if (target < this.#stepsTaken) {
			this.reset();
		}
		// Wide enough that a capture can step the whole cast in one call, tight
		// enough that a tab throttled for a minute does not replay all of it.
		const budget = Math.min(target - this.#stepsTaken, 900);
		this.#stepsTaken = target - budget;
		for (let i = 0; i < budget; i += 1) {
			this.#stepsTaken += 1;
			this.#step(this.#stepsTaken * STEP_MS);
		}
	}

	#step(tMs: number): void {
		const arc = sampleArc(this.#spell.beats, tMs);
		const dt = STEP_MS / 1000;
		const tSec = tMs / 1000;

		this.#emitDebt += arc.emission * dt;
		let budget = Math.floor(this.#emitDebt);
		this.#emitDebt -= budget;

		let live = 0;
		for (const stroke of this.#strokes) {
			if (stroke.alive) {
				this.#advance(stroke, tSec, dt, arc);
				if (stroke.alive) live += 1;
			}
		}

		for (const stroke of this.#strokes) {
			if (budget <= 0 || live >= LIVE_CAP) {
				break;
			}
			if (!stroke.alive) {
				this.#spawn(stroke, arc);
				budget -= 1;
				live += 1;
			}
		}
	}

	#advance(stroke: Stroke, tSec: number, dt: number, arc: ArcSample): void {
		stroke.ageMs += STEP_MS;
		if (stroke.ageMs >= stroke.lifeMs) {
			stroke.alive = false;
			return;
		}

		sampleFlow(this.#flow, stroke, this.#spell, tSec, arc.drive);
		const grab = Math.min(1, dt * stroke.inertia);
		stroke.vx += (this.#flow.x - stroke.vx) * grab;
		stroke.vy += (this.#flow.y - stroke.vy) * grab;
		stroke.vz += (this.#flow.z - stroke.vz) * grab;
		stroke.x += stroke.vx * dt;
		stroke.y += stroke.vy * dt;
		stroke.z += stroke.vz * dt;

		// The long axis chases the direction of travel on screen. Chasing rather
		// than snapping is what keeps a stroke reading as a mark being dragged.
		const speed = Math.hypot(stroke.vx, stroke.vy, stroke.vz);
		if (speed > 0.04) {
			// Screen up is +z off the paper and -y along it, matching `projectSeal`.
			// Near the paper the marks are pulled toward vertical, because a mark
			// that simply follows the foot's outward flow points away from the axis
			// and a ring of those reads as a starburst rather than as a fire.
			const rooted = 1.7 * (1 - smoothstep(0, 0.95, stroke.z));
			const target =
				Math.atan2(
					stroke.vz * HEIGHT_FORESHORTENING - stroke.vy * PORTAL.scaleY + rooted,
					stroke.vx
				) + stroke.lean;
			stroke.angle += wrapAngle(target - stroke.angle) * Math.min(1, dt * 6.5);
		}
		stroke.angle += stroke.spin * dt;
	}

	#spawn(stroke: Stroke, arc: ArcSample): void {
		const rng = this.#rng;
		const kind = this.#birthKind(arc);
		const recipe = RECIPE[kind];
		const spell = this.#spell;

		let angle = rng() * Math.PI * 2;
		let radius: number;
		let z: number;
		let outward: number;
		let up: number;
		let heat: number;

		if (kind === 'gather') {
			radius = between(rng, 0.28, 1.35);
			z = between(rng, 0.01, 0.24);
			outward = -between(rng, 0.32, 0.82);
			up = between(rng, 0.04, 0.26);
			// Ambient ink, not ash: warm sepia washing in, never neutral grey.
			heat = between(rng, 0.42, 0.68);
		} else if (kind === 'site') {
			const site = spell.sites.length
				? pick(rng, spell.sites)
				: { at: { x: 0, y: -0.8 }, facing: { x: 0, y: 1 } };
			angle = Math.atan2(site.at.y, site.at.x) + between(rng, -0.34, 0.34);
			radius = between(rng, 0.6, 0.95);
			z = between(rng, 0, 0.2);
			outward = -between(rng, 0.9, 1.9);
			up = between(rng, 0.3, 0.95);
			heat = between(rng, 0.44, 0.72);
		} else if (kind === 'burst') {
			// The punch throws a ring out, but it is a column that is being lit, so
			// most of the impulse is up the axis rather than across the paper.
			radius = between(rng, 0.04, 0.38);
			z = between(rng, 0.01, 0.34);
			outward = between(rng, 0.5, 1.7);
			up = between(rng, 1.8, 4.2);
			heat = between(rng, 0.62, 0.98);
		} else if (kind === 'crown') {
			radius = between(rng, 0.05, 0.9);
			z = between(rng, 0.85, 2.25);
			outward = between(rng, -0.1, 0.55);
			up = between(rng, 0.25, 0.85);
			heat = between(rng, 0.12, 0.4);
		} else {
			// The column proper: pigment fed in low and near the axis, thinning out
			// toward the footprint the jet was aimed with.
			radius = spell.footprint * (rng() + rng()) * 0.85;
			z = between(rng, 0.02, 0.72) * (0.4 + 0.6 * arc.risen);
			outward = between(rng, -0.1, 0.4);
			up = between(rng, 0.5, 1.6) * (0.5 + 0.7 * arc.drive);
			heat = 0.55 + 0.44 * (1 - Math.min(1, radius / (spell.footprint * 1.6)));
			heat += between(rng, -0.12, 0.12);
		}

		// Gather is the medium rather than the fire, so the cast's cooling does not
		// reach it; everything else is banked down as the feed is cut.
		heat = Math.max(0, Math.min(1, heat - arc.soot * (kind === 'gather' ? 0.1 : 0.45)));
		// The hot core is a place inside the mass, not a property of a stroke kind:
		// low, near the axis, and already the hottest pigment on the ramp.
		const hot =
			kind !== 'gather' &&
			kind !== 'crown' &&
			heat > 0.78 &&
			radius < 0.32 &&
			z < 0.7 &&
			rng() < 0.55;

		stroke.alive = true;
		stroke.x = Math.cos(angle) * radius;
		stroke.y = Math.sin(angle) * radius;
		stroke.z = z;
		stroke.vx = Math.cos(angle) * outward;
		stroke.vy = Math.sin(angle) * outward;
		stroke.vz = up;
		stroke.ageMs = 0;
		stroke.lifeMs = between(rng, recipe.life[0], recipe.life[1]) * (hot ? 0.72 : 1);
		// Marks laid on the paper are small and many; the big sweeps belong to the
		// climbing part of the column, where one stroke can span a whole lick.
		stroke.size =
			between(rng, recipe.size[0], recipe.size[1]) *
			(1 + 0.35 * arc.punch) *
			(0.62 + 0.48 * Math.min(1, z / 0.7));
		stroke.squash = between(rng, 0.82, 1.18);
		stroke.slot = pick(rng, z < 0.32 && rng() < 0.72 ? BASE_SLOTS : recipe.slots);
		stroke.flip = Math.floor(rng() * 4);
		stroke.angle = rng() * Math.PI * 2;
		stroke.lean = bunched(rng) * 0.55;
		stroke.spin = between(rng, -1.5, 1.5) * (stroke.slot === BRUSH_SLOT.wash ? 1 : 0.28);
		stroke.inertia = between(rng, 2.6, 8.5);
		stroke.looseness = between(rng, 0.45, 1.75);
		stroke.wander = rng() * Math.PI * 2;
		stroke.phase = rng() * Math.PI * 2;
		stroke.flickerRate = between(rng, 6, 22);
		stroke.growth = between(rng, recipe.growth[0], recipe.growth[1]);
		stroke.peak = between(rng, recipe.peak[0], recipe.peak[1]) * (hot ? 0.8 : 1);
		stroke.heat = heat;
		stroke.hot = hot;
	}

	/** Which kind the arc is asking for. The mix is the whole shape of the beat. */
	#birthKind(arc: ArcSample): BirthKind {
		const roll = this.#rng();
		if (arc.risen < 0.12) {
			return roll < 0.92 ? 'gather' : 'site';
		}
		if (arc.punch > 0.12) {
			if (roll < 0.34) return 'burst';
			return roll < 0.78 ? 'column' : 'site';
		}
		if (roll < 0.76) return 'column';
		if (roll < 0.87) return 'site';
		if (roll < 0.96) return 'crown';
		return 'gather';
	}

	/**
	 * The live strokes as two painter-ordered quad lists: the alpha-blended mass,
	 * and the additive hot core drawn over it.
	 */
	collect(tMs: number): ColumnQuads {
		const arc = sampleArc(this.#spell.beats, tMs);
		const tSec = tMs / 1000;
		const mass = this.#out.mass;
		const hot = this.#out.hot;
		mass.length = 0;
		hot.length = 0;

		for (let i = 0; i < this.#strokes.length; i += 1) {
			const stroke = this.#strokes[i];
			if (!stroke.alive) {
				continue;
			}
			const u = stroke.ageMs / stroke.lifeMs;
			const flicker = 0.82 + 0.18 * Math.sin(tSec * stroke.flickerRate + stroke.phase);
			const alpha =
				stroke.peak *
				smoothstep(0, 0.09, u) *
				(1 - smoothstep(0.52, 1, u)) *
				flicker *
				(1 - 0.45 * arc.soot * (stroke.hot ? 1 : 0.3));
			if (alpha < 0.004) {
				continue;
			}

			const heat = Math.min(
				stroke.hot ? 1 : MASS_CEILING,
				stroke.heat - 0.3 * u ** 0.85 - 0.24 * smoothstep(1.1, 3.4, stroke.z) - 0.5 * arc.soot * u
			);
			pigment(heat, this.#tint);

			const scale =
				(0.4 + 0.6 * smoothstep(0, 0.15, u)) *
				(1 + stroke.growth * u) *
				(1 + 0.11 * Math.sin(tSec * stroke.flickerRate * 0.45 + stroke.phase * 1.7));

			const quad = this.#quads[i];
			quad.x = stroke.x;
			quad.y = stroke.y;
			quad.z = stroke.z;
			quad.halfLong = stroke.size * scale;
			quad.halfShort = stroke.size * scale * stroke.squash;
			quad.angle = stroke.angle;
			quad.slot = stroke.slot;
			quad.flip = stroke.flip;
			quad.r = this.#tint.r;
			quad.g = this.#tint.g;
			quad.b = this.#tint.b;
			quad.alpha = alpha;
			quad.depth = -(stroke.y * HEIGHT_FORESHORTENING + stroke.z * PORTAL.scaleY);
			(stroke.hot ? hot : mass).push(quad);
		}

		mass.sort(byDepth);
		hot.sort(byDepth);
		return this.#out;
	}
}

/** Farthest first: the projection's `depth` grows with distance from the viewer. */
function byDepth(a: QuadWrite, b: QuadWrite): number {
	return b.depth - a.depth;
}

function blankStroke(): Stroke {
	return {
		alive: false,
		x: 0,
		y: 0,
		z: 0,
		vx: 0,
		vy: 0,
		vz: 0,
		ageMs: 0,
		lifeMs: 1,
		size: 0.5,
		squash: 1,
		slot: BRUSH_SLOT.wash,
		flip: 0,
		angle: 0,
		lean: 0,
		spin: 0,
		inertia: 4,
		looseness: 1,
		wander: 0,
		phase: 0,
		flickerRate: 10,
		growth: 0.5,
		peak: 0.4,
		heat: 0.5,
		hot: false
	};
}

function blankQuad(): QuadWrite {
	return {
		x: 0,
		y: 0,
		z: 0,
		halfLong: 0.5,
		halfShort: 0.5,
		angle: 0,
		slot: BRUSH_SLOT.wash,
		flip: 0,
		r: 1,
		g: 1,
		b: 1,
		alpha: 1,
		depth: 0
	};
}
