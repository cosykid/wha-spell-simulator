/**
 * @file The brush population: a fixed pool of marks that ride the fluid's own
 * flow field and are painted as the mass's hand-inked silhouette.
 *
 * Two rules make the licks accents rather than confetti. They integrate
 * {@link flowAccel} — the same forces, the same drag, the same curl octaves the
 * GPU parcels feel — so a mark travels the streamline the mass beside it
 * travels. And every mark's opacity is multiplied by {@link massDensity}, the
 * coverage of the fluid underneath it, so a mark that outruns the body fades
 * out instead of flying off on its own.
 */

import { mulberry32, type Rng } from '$lib/cast/rng.js';
import { HEIGHT_FORESHORTENING, PORTAL } from '$lib/portal/portal.js';
import { emissionAt, driveAt, lickRateAt, punchAt, sootAt } from './arc.js';
import { dragOver, flowAccel, massDensity, type FlowSample } from './flowField.js';
import { blankMark, birth, findTear, type Mark, type MarkKind } from './lickBirth.js';
import { pigment } from './palette.js';
import { LICK, STEP_S } from './tuning.js';
import type { QuadWrite } from './brushMesh.js';
import type { HybridSpell } from './hybridSpell.js';

/**
 * Steps between field samples for one mark, staggered across the pool. The field
 * is smooth over fifty milliseconds, so a mark that re-reads it every third step
 * follows the same streamline for a third of the cost.
 */
const FIELD_STRIDE = 3;

/**
 * The two lists a frame is painted from, each sorted back-to-front.
 *
 * The split is by what the mark has to do to the mass under it. A lick is the
 * flame torn off the edge, and the mass it lies on is already glowing, so a
 * composited mark there can only ever darken it — the licks are added. Washes
 * and soot are pigment laid *over* the fire and have to cover, so they are
 * composited.
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

/** Farthest first: `depth` grows with distance from the viewer. */
function byDepth(a: QuadWrite, b: QuadWrite): number {
	return b.depth - a.depth;
}

export class LickSwarm {
	readonly #spell: HybridSpell;
	readonly #marks: Mark[] = [];
	readonly #quads: QuadWrite[] = [];
	readonly #out: SwarmQuads = { laid: [], added: [] };
	readonly #tint = { r: 0, g: 0, b: 0 };
	readonly #sample: FlowSample = { x: 0, y: 0, z: 0, outward: 0 };
	#rng: Rng = mulberry32(0x1ceb00da);
	#debt = 0;
	#steps = 0;

	constructor(spell: HybridSpell) {
		this.#spell = spell;
		for (let i = 0; i < LICK.pool; i += 1) {
			this.#marks.push(blankMark());
			this.#quads.push(blankQuad());
		}
	}

	/** Drop everything in flight, so the cast replays from the charge. */
	reset(): void {
		for (const mark of this.#marks) {
			mark.alive = false;
		}
		this.#rng = mulberry32(0x1ceb00da);
		this.#debt = 0;
		this.#steps = 0;
	}

	/** Advances one fixed step of the shared clock, at cast time `tMs`. */
	step(tMs: number): void {
		this.#steps += 1;
		const tSec = tMs / 1000;
		const drive = driveAt(this.#spell, tMs);
		const punch = punchAt(this.#spell, tMs);
		const soot = sootAt(this.#spell, tMs);
		const emission = emissionAt(this.#spell, tMs);

		let live = 0;
		for (let i = 0; i < this.#marks.length; i += 1) {
			const mark = this.#marks[i];
			if (mark.alive) {
				this.#advance(mark, i, tSec, punch);
				if (mark.alive) live += 1;
			}
		}

		this.#debt += lickRateAt(this.#spell, tMs) * STEP_S;
		let budget = Math.floor(this.#debt);
		this.#debt -= budget;
		for (const mark of this.#marks) {
			if (budget <= 0 || live >= LICK.liveCap) {
				break;
			}
			if (!mark.alive) {
				const kind = this.#kind(punch, soot);
				const risen = Math.min(1, emission * 1.5 + punch);
				const site = findTear(this.#sample, this.#rng, this.#spell, tSec, punch, risen);
				birth(mark, this.#rng, this.#spell, kind, site, drive, punch, soot);
				budget -= 1;
				live += 1;
			}
		}
	}

	/** The live marks as two painter-ordered quad lists, at cast time `tMs`. */
	collect(tMs: number): SwarmQuads {
		const tSec = tMs / 1000;
		const soot = sootAt(this.#spell, tMs);
		const emission = emissionAt(this.#spell, tMs);
		const laid = this.#out.laid;
		const added = this.#out.added;
		laid.length = 0;
		added.length = 0;

		for (let i = 0; i < this.#marks.length; i += 1) {
			const mark = this.#marks[i];
			if (!mark.alive) {
				continue;
			}
			const u = mark.ageMs / mark.lifeMs;
			const flicker = 0.82 + 0.18 * Math.sin(tSec * mark.flickerRate + mark.phase);
			// The mass under the mark is what licenses it. Crown smoke is allowed to
			// carry on above the body, because that is where smoke goes.
			const cover = massDensity(this.#spell, mark.x, mark.y, mark.z, tSec, emission);
			// A mark reads where the mass is thinning. Deep inside the body the fluid is
			// already saturated and a mark there can only flatten it, so the licks give
			// way there and come back at the edge they were born on.
			const cling =
				mark.kind === 'crown'
					? 0.35 + 0.65 * cover
					: cover ** LICK.clingPower * (1 - 0.34 * smoothstep(0.8, 1, cover));
			const alpha =
				mark.peak * smoothstep(0, 0.1, u) * (1 - smoothstep(0.5, 1, u)) * flicker * cling;
			if (alpha < 0.004) {
				continue;
			}

			const heat = Math.max(0, mark.heat - 0.28 * u ** 0.85 - 0.4 * soot * u);
			pigment(heat, this.#tint);
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
			(mark.kind === 'lick' ? added : laid).push(quad);
		}

		laid.sort(byDepth);
		added.sort(byDepth);
		return this.#out;
	}

	#advance(mark: Mark, index: number, tSec: number, punch: number): void {
		mark.ageMs += STEP_S * 1000;
		if (mark.ageMs >= mark.lifeMs) {
			mark.alive = false;
			return;
		}
		const age01 = mark.ageMs / mark.lifeMs;
		if ((this.#steps + index) % FIELD_STRIDE === 0) {
			flowAccel(this.#sample, this.#spell, mark.x, mark.y, mark.z, tSec, age01, punch);
			// A mark is a loaded brush, not a mote: it takes the field up over a few
			// frames, which is what leaves a smear rather than a snap.
			const grab = Math.min(1, STEP_S * FIELD_STRIDE * mark.inertia);
			mark.ax += (this.#sample.x - mark.ax) * grab;
			mark.ay += (this.#sample.y - mark.ay) * grab;
			mark.az += (this.#sample.z - mark.az) * grab;
		}

		mark.vx += mark.ax * STEP_S;
		mark.vy += mark.ay * STEP_S;
		mark.vz += mark.az * STEP_S;
		const damp = dragOver(STEP_S, age01);
		mark.vx *= damp;
		mark.vy *= damp;
		mark.vz *= damp;
		mark.x += mark.vx * STEP_S;
		mark.y += mark.vy * STEP_S;
		mark.z = Math.max(0, mark.z + mark.vz * STEP_S);

		// The long axis chases the direction of travel on screen. Chasing rather
		// than snapping is what keeps a mark reading as pigment being dragged.
		const speed = Math.hypot(mark.vx, mark.vy, mark.vz);
		if (speed > 0.04) {
			// Screen up is +z off the paper and -y along it, matching `projectSeal`.
			// Near the paper the marks are pulled toward vertical, because a mark
			// that simply follows the foot's outward flow points away from the axis
			// and a ring of those reads as a starburst rather than as a fire.
			// The pull scales with how hard the mark is travelling sideways, because a
			// fast outward mark at the foot is exactly the one that would draw a blade
			// pointing away from the axis.
			const sideways = Math.hypot(mark.vx, mark.vy);
			const rooted = (1.6 + 1.5 * sideways) * (1 - smoothstep(0, 1.15, mark.z));
			const target =
				Math.atan2(mark.vz * HEIGHT_FORESHORTENING - mark.vy * PORTAL.scaleY + rooted, mark.vx) +
				mark.lean;
			mark.angle += wrapAngle(target - mark.angle) * Math.min(1, STEP_S * 6.5);
		}
		mark.angle += mark.spin * STEP_S;
	}

	/** Which kind the arc is asking for. The mix is the whole shape of the beat. */
	#kind(punch: number, soot: number): MarkKind {
		const roll = this.#rng();
		if (punch > 0.1) {
			return roll < 0.72 ? 'lick' : 'tongue';
		}
		// Smoke is the cast's last beat, not a constant. A crown share that runs all
		// through the body puts a brown cloud over the fire it is supposed to leave.
		if (roll < 0.04 + 0.52 * soot) {
			return 'crown';
		}
		return roll < 0.78 ? 'lick' : 'tongue';
	}
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
