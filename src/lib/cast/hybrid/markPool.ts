/**
 * @file One channel's brush population: a fixed pool of marks that ride the
 * parcels' own flow field and are painted as the mass's hand-inked silhouette.
 *
 * Two rules make the marks accents rather than confetti. They integrate
 * {@link flowAccel} — the same forces, the same drag, the same curl octaves the
 * GPU parcels feel — so a mark travels the streamline the mass beside it
 * travels. And every mark's opacity is multiplied by {@link massDensity}, the
 * coverage of the mass underneath it, so a mark that outruns the body fades out
 * instead of flying off on its own. That second rule is the anti-confetti law
 * and nothing may be exempt from it.
 *
 * Pure CPU and pure arithmetic: no three.js, no context, no clock. The golden
 * tier performs a whole cast through this in plain Node.
 */

import { mulberry32, type Rng } from '../rng.js';
import { HEIGHT_FORESHORTENING, PORTAL } from '../../portal/portal.js';
import { dragOver, flowAccel, massDensity, type FlowSample, type FlowShape } from './flow.js';
import { birth, blankMark, type BirthArc, type Mark, type MarkKind } from './mark.js';
import { findTear } from './tear.js';
import { pigment, type Palette, type Tint } from './palette.js';
import { MARK } from './tuning.js';
import type { BrushSlot } from './brushSlot.js';

/** One mark, as a layer needs it: a placed, oriented, tinted quad. */
export interface QuadWrite {
	x: number;
	y: number;
	z: number;
	/** Half-extents in seal units, along the mark's own axes. */
	halfLong: number;
	halfShort: number;
	/** Screen-space rotation of the long axis, in radians. */
	angle: number;
	slot: BrushSlot;
	/** Bits 0 and 1 mirror the stamp in u and v, so four stamps read as sixteen. */
	flip: number;
	r: number;
	g: number;
	b: number;
	alpha: number;
	/** Seal-space distance from the viewer. Larger is farther, so a layer sorts descending. */
	depth: number;
}

/**
 * The two lists a frame is painted from, each sorted back to front.
 *
 * The split is by what a mark has to do to the mass under it. A lick is the
 * flame torn off the edge and the mass it lies on is already glowing, so a
 * composited mark there could only darken it: the licks are added. Washes, soot
 * and the outline ink are pigment laid *over* the mass and have to cover, so
 * they are composited.
 */
export interface SwarmQuads {
	laid: QuadWrite[];
	added: QuadWrite[];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

function wrapAngle(value: number): number {
	return value - Math.PI * 2 * Math.round(value / (Math.PI * 2));
}

function blankQuad(): QuadWrite {
	return {
		x: 0,
		y: 0,
		z: 0,
		halfLong: 0.4,
		halfShort: 0.4,
		angle: 0,
		slot: 1,
		flip: 0,
		r: 1,
		g: 1,
		b: 1,
		alpha: 1,
		depth: 0
	};
}

/** What the pool needs from the arc each step, beyond the shape it rides. */
export interface MarkArc extends BirthArc {
	/** Marks born per second right now. */
	rate: number;
	/** Share of births drawn as dark outline ink rather than as pigment. */
	inkShare: number;
	/** How much smoke this archetype leaves. A shockwave leaves none. */
	crownShare: number;
	/** Of what is left, how much pools as a flat wash rather than tearing off. */
	tongueShare: number;
}

export class MarkPool {
	readonly #marks: Mark[] = [];
	readonly #quads: QuadWrite[] = [];
	readonly #sample: FlowSample = { x: 0, y: 0, z: 0, outward: 0 };
	readonly #tint: Tint = { r: 0, g: 0, b: 0 };
	readonly #palette: Palette;
	readonly #capacity: number;
	readonly #seed: number;
	#rng: Rng;
	#debt = 0;
	#steps = 0;
	#live = 0;
	#born = 0;

	constructor(capacity: number, seed: number, palette: Palette) {
		this.#capacity = capacity;
		this.#seed = seed;
		this.#palette = palette;
		this.#rng = mulberry32(seed);
		for (let i = 0; i < capacity; i += 1) {
			this.#marks.push(blankMark());
			this.#quads.push(blankQuad());
		}
	}

	/** Live marks right now. The cast golden tier reads this. */
	get live(): number {
		return this.#live;
	}

	/** Marks this pool has ever laid. A spawn tally a baseline can compare. */
	get born(): number {
		return this.#born;
	}

	/** Drop everything in flight so the cast replays from the charge. */
	reset(): void {
		for (const mark of this.#marks) {
			mark.alive = false;
		}
		this.#rng = mulberry32(this.#seed);
		this.#debt = 0;
		this.#steps = 0;
		this.#live = 0;
		this.#born = 0;
	}

	/** Advances one fixed step of the shared clock, at cast time `tMs`. */
	step(shape: FlowShape, arc: MarkArc, tMs: number, dtS: number): void {
		this.#steps += 1;
		const tSec = tMs / 1000;

		let live = 0;
		for (let i = 0; i < this.#marks.length; i += 1) {
			const mark = this.#marks[i];
			if (mark.alive) {
				this.#advance(mark, i, shape, tSec, dtS);
				if (mark.alive) live += 1;
			}
		}

		this.#debt += arc.rate * dtS;
		let budget = Math.floor(this.#debt);
		this.#debt -= budget;
		for (const mark of this.#marks) {
			if (budget <= 0 || live >= this.#capacity) {
				break;
			}
			if (!mark.alive) {
				const kind = this.#kind(arc);
				const risen = Math.min(1, shape.emission * 1.5 + arc.punch);
				const site = findTear(this.#sample, this.#rng, shape, tSec, risen);
				birth(mark, this.#rng, shape, kind, site, arc);
				budget -= 1;
				live += 1;
				this.#born += 1;
			}
		}
		this.#live = live;
	}

	/** The live marks appended to two painter-ordered quad lists, at cast time `tMs`. */
	collect(out: SwarmQuads, shape: FlowShape, arc: BirthArc, tMs: number): void {
		const tSec = tMs / 1000;
		for (let i = 0; i < this.#marks.length; i += 1) {
			const mark = this.#marks[i];
			if (!mark.alive) {
				continue;
			}
			const u = mark.ageMs / mark.lifeMs;
			const flicker = 0.82 + 0.18 * Math.sin(tSec * mark.flickerRate + mark.phase);
			// The mass under the mark is what licenses it. Crown smoke is allowed to
			// carry on above the body, because that is where smoke goes.
			const cover = massDensity(shape, mark.x, mark.y, mark.z, tSec);
			// A mark reads where the mass is thinning. Deep inside the body the mass
			// is already saturated and a mark there can only flatten it, so the marks
			// give way there and come back at the edge they were born on.
			const cling =
				mark.kind === 'crown'
					? 0.35 + 0.65 * cover
					: cover ** MARK.clingPower * (1 - 0.34 * smoothstep(0.8, 1, cover));
			const alpha =
				mark.peak * smoothstep(0, 0.1, u) * (1 - smoothstep(0.5, 1, u)) * flicker * cling;
			if (alpha < 0.004) {
				continue;
			}

			if (mark.kind === 'ink') {
				this.#tint.r = this.#palette.ink[0];
				this.#tint.g = this.#palette.ink[1];
				this.#tint.b = this.#palette.ink[2];
			} else {
				const heat = Math.max(0, mark.heat - 0.28 * u ** 0.85 - 0.4 * arc.soot * u);
				pigment(this.#palette.stops, heat, this.#tint);
			}
			const scale =
				(0.42 + 0.58 * smoothstep(0, 0.14, u)) *
				(1 + mark.growth * u) *
				(1 + 0.1 * Math.sin(tSec * mark.flickerRate * 0.45 + mark.phase * 1.7));

			const quad = this.#quads[i];
			quad.x = mark.x;
			quad.y = mark.y;
			quad.z = mark.z;
			quad.halfLong = mark.size * scale;
			quad.halfShort = mark.size * scale * mark.squash;
			quad.angle = mark.angle;
			quad.slot = mark.slot;
			quad.flip = mark.flip;
			quad.r = this.#tint.r;
			quad.g = this.#tint.g;
			quad.b = this.#tint.b;
			quad.alpha = alpha;
			quad.depth = -(mark.y * HEIGHT_FORESHORTENING + mark.z * PORTAL.scaleY);
			(mark.kind === 'lick' ? out.added : out.laid).push(quad);
		}
	}

	/** Seal-space centroid of the live marks, and how far they reach. */
	measure(out: { x: number; y: number; z: number; reach: number; speed: number }): void {
		let count = 0;
		let sx = 0;
		let sy = 0;
		let sz = 0;
		let reach = 0;
		let speed = 0;
		for (const mark of this.#marks) {
			if (!mark.alive) {
				continue;
			}
			count += 1;
			sx += mark.x;
			sy += mark.y;
			sz += mark.z;
			reach = Math.max(reach, Math.hypot(mark.x, mark.y, mark.z));
			speed += Math.hypot(mark.vx, mark.vy, mark.vz);
		}
		out.x = count ? sx / count : 0;
		out.y = count ? sy / count : 0;
		out.z = count ? sz / count : 0;
		out.reach = reach;
		out.speed = count ? speed / count : 0;
	}

	#advance(mark: Mark, index: number, shape: FlowShape, tSec: number, dtS: number): void {
		mark.ageMs += dtS * 1000;
		if (mark.ageMs >= mark.lifeMs) {
			mark.alive = false;
			return;
		}
		const age01 = mark.ageMs / mark.lifeMs;
		if ((this.#steps + index) % MARK.fieldStride === 0) {
			flowAccel(this.#sample, shape, mark.x, mark.y, mark.z, tSec, age01);
			// A mark is a loaded brush, not a mote: it takes the field up over a few
			// frames, which is what leaves a smear rather than a snap.
			const grab = Math.min(1, dtS * MARK.fieldStride * mark.inertia);
			mark.ax += (this.#sample.x - mark.ax) * grab;
			mark.ay += (this.#sample.y - mark.ay) * grab;
			mark.az += (this.#sample.z - mark.az) * grab;
		}

		mark.vx += mark.ax * dtS;
		mark.vy += mark.ay * dtS;
		mark.vz += mark.az * dtS;
		const damp = dragOver(shape, dtS, age01);
		mark.vx *= damp;
		mark.vy *= damp;
		mark.vz *= damp;
		mark.x += mark.vx * dtS;
		mark.y += mark.vy * dtS;
		mark.z = Math.max(0, mark.z + mark.vz * dtS);

		// The long axis chases the direction of travel on screen. Chasing rather
		// than snapping is what keeps a mark reading as pigment being dragged.
		const speed = Math.hypot(mark.vx, mark.vy, mark.vz);
		if (speed > 0.04) {
			// Screen up is +z off the paper and -y along it, matching `projectSeal`.
			// Near the paper the marks are pulled toward vertical, because a mark that
			// simply follows an outward flow at the foot points away from the axis and
			// a ring of those reads as a starburst rather than as a fire.
			const sideways = Math.hypot(mark.vx, mark.vy);
			const rooted = (1.6 + 1.5 * sideways) * (1 - smoothstep(0, 1.15, mark.z));
			const target =
				Math.atan2(mark.vz * HEIGHT_FORESHORTENING - mark.vy * PORTAL.scaleY + rooted, mark.vx) +
				mark.lean;
			mark.angle += wrapAngle(target - mark.angle) * Math.min(1, dtS * 6.5);
		}
		mark.angle += mark.spin * dtS;
	}

	/** Which kind the arc is asking for. The mix is the whole shape of the beat. */
	#kind(arc: MarkArc): MarkKind {
		const roll = this.#rng();
		// The outline is drawn first out of the roll, so its share is exact however
		// the rest of the mix moves.
		if (roll < arc.inkShare) {
			return 'ink';
		}
		// Smoke is the cast's last beat, not a constant. A crown share that runs all
		// through the body puts a brown cloud over the fire it is supposed to leave.
		const crownEnd = arc.inkShare + arc.crownShare * (0.04 + 0.52 * arc.soot);
		if (roll < crownEnd) {
			return 'crown';
		}
		// Of what is left, the split between the wash that pools and the tongue
		// that tears. A punch smears where a body licks.
		const rest = (roll - crownEnd) / Math.max(1e-6, 1 - crownEnd);
		return rest < arc.tongueShare + 0.1 * arc.punch ? 'tongue' : 'lick';
	}
}
