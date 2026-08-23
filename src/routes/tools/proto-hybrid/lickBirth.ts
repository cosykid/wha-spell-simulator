/**
 * @file Where a brush mark is born, and what it is made of.
 *
 * The licks are accents drawn *on* the fluid, so a mark may not be placed
 * anywhere the mass is not. Every birth site is found on the mass's own
 * wandering boundary — the surface `sim.glsl.ts` pinches its parcels toward —
 * and among a handful of candidates the one that is tearing hardest wins:
 * turbulence pushing outward through the edge, a boundary already bulging into a
 * shoulder, and a place on screen where the silhouette actually reads.
 */

import type { Rng } from '$lib/cast/rng.js';
import { MASS_CEILING } from './palette.js';
import { BRUSH_SLOT, type BrushSlot } from './brushStamps.js';
import { boundaryRadius, flowAccel, silhouetteRadius, type FlowSample } from './flowField.js';
import { FLOW, LICK } from './tuning.js';
import type { HybridSpell } from './hybridSpell.js';

/** What a mark is: an accent on the edge, a wash at the foot, or smoke above. */
export type MarkKind = 'lick' | 'tongue' | 'crown';

/** One laid mark with a life. Not a particle: a mark, being dragged. */
export interface Mark {
	alive: boolean;
	kind: MarkKind;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	ax: number;
	ay: number;
	az: number;
	ageMs: number;
	lifeMs: number;
	size: number;
	squash: number;
	slot: BrushSlot;
	flip: number;
	angle: number;
	/** Radians this mark sits off the flow direction, so the crowd never combs. */
	lean: number;
	spin: number;
	inertia: number;
	peak: number;
	growth: number;
	heat: number;
	phase: number;
	flickerRate: number;
}

/** How each kind is built. One row per kind, read straight by {@link birth}. */
const RECIPE: Record<
	MarkKind,
	{ life: [number, number]; size: [number, number]; slots: BrushSlot[] }
> = {
	lick: {
		life: [380, 900],
		size: [LICK.sizeLow, LICK.sizeHigh],
		// Licks give the edge its tongues; the streaks between them are what keep
		// the accent reading as pigment dragged over a mass.
		slots: [
			BRUSH_SLOT.lick,
			BRUSH_SLOT.lick,
			BRUSH_SLOT.lick,
			BRUSH_SLOT.lick,
			BRUSH_SLOT.streak,
			BRUSH_SLOT.wash
		]
	},
	tongue: {
		life: [520, 1180],
		size: [0.24, 0.62],
		// No soot down here: charcoal laid on the plate greys the foot, and the foot
		// is the one place the mass has to stay pigment.
		slots: [BRUSH_SLOT.wash, BRUSH_SLOT.wash, BRUSH_SLOT.streak]
	},
	crown: {
		life: [1100, 2100],
		size: [0.5, 1.15],
		slots: [BRUSH_SLOT.soot, BRUSH_SLOT.soot, BRUSH_SLOT.wash]
	}
};

function between(rng: Rng, min: number, max: number): number {
	return min + rng() * (max - min);
}

function pick<T>(rng: Rng, list: readonly T[]): T {
	return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function bunched(rng: Rng): number {
	return (rng() + rng() + rng() - 1.5) / 1.5;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** How hot the mass is at this place: young and near the axis down low, cooling up. */
function localHeat(spell: HybridSpell, radius: number, z: number, edge: number): number {
	const climb = smoothstep(0, spell.reach * 1.3, z);
	const off = Math.min(1, radius / Math.max(edge, 1e-3));
	return Math.max(0, 0.99 - 0.6 * climb - 0.2 * off);
}

/**
 * How hard the mass is tearing at this point on its edge. Turbulence pushing out
 * through the boundary, a boundary already bulged into a shoulder, and the
 * screen-space payoff of an accent there.
 */
function tearAt(
	sample: FlowSample,
	spell: HybridSpell,
	angle: number,
	z: number,
	tSec: number,
	punch: number
): number {
	const pinch = boundaryRadius(spell, angle, z, tSec);
	const edge = pinch * FLOW.silhouette;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	flowAccel(sample, spell, cos * edge, sin * edge, z, tSec, 0.45, punch);
	const outward = sample.x * cos + sample.y * sin;
	const hn = z / Math.max(spell.reach, 1e-3);
	const shoulder =
		pinch / (spell.footprint * (1 - FLOW.narrow * smoothstep(0, 0.95, hn)) + 0.04) - 1;
	// The silhouette reads at the screen edges of the column and on the near face;
	// a lick behind the mass is a lick nobody sees.
	const facing = 0.78 * Math.abs(cos) + 0.22 * (0.5 + 0.5 * sin);
	return 1.3 * Math.max(0, outward) + 2.4 * Math.max(0, shoulder) + 2.1 * facing;
}

/** The site the search settled on, so the caller can reuse the numbers. */
export interface BirthSite {
	angle: number;
	z: number;
	edge: number;
	/** How hard the mass was tearing there. The mark is drawn to match. */
	tear: number;
}

/**
 * Draws places on the boundary until one is tearing hard enough to accept.
 *
 * Rejection rather than best-of-N: keeping the single best candidate every frame
 * marches the whole crowd onto the same shoulder, and a knot of licks in one
 * place is the blob this direction is trying not to be.
 */
export function findTear(
	sample: FlowSample,
	rng: Rng,
	spell: HybridSpell,
	tSec: number,
	punch: number,
	risen: number
): BirthSite {
	let site: BirthSite = { angle: 0, z: 0, edge: spell.footprint * FLOW.silhouette, tear: 0 };
	for (let i = 0; i < LICK.tearSamples; i += 1) {
		const angle = rng() * Math.PI * 2;
		// The upper column and the shoulders, where the mass sheds; never only the
		// crown, or the accents float free of the body they belong to. And never
		// down on the plate: a tongue laid flat on the foot has nothing to tear off
		// and reads as a stamped wedge.
		const z = spell.reach * (0.34 + 0.85 * rng() ** 0.72) * (0.4 + 0.6 * risen);
		const tear = tearAt(sample, spell, angle, z, tSec, punch);
		site = { angle, z, edge: silhouetteRadius(spell, angle, z, tSec), tear };
		if (tear > LICK.tearBar * rng()) {
			break;
		}
	}
	return site;
}

/** Fills `mark` with a fresh birth of `kind` at `site`. */
export function birth(
	mark: Mark,
	rng: Rng,
	spell: HybridSpell,
	kind: MarkKind,
	site: BirthSite,
	drive: number,
	punch: number,
	soot: number
): void {
	const recipe = RECIPE[kind];
	const cos = Math.cos(site.angle);
	const sin = Math.sin(site.angle);
	let radius = site.edge * between(rng, LICK.insetLow, LICK.insetHigh);
	let z = site.z;
	let rise = spell.speed * drive * between(rng, 0.7, 1.25);
	let outward = between(rng, -0.12, 0.3) * drive;

	if (kind === 'tongue') {
		// Down at the plate a tongue has nowhere to point, so it is laid flat: a
		// wash pooling outward, which is what the foot needs to stop being specks.
		radius = spell.footprint * between(rng, 0.1, 1.05);
		z = between(rng, 0.0, 0.22);
		rise = spell.speed * drive * between(rng, 0.2, 0.7);
		outward = between(rng, 0.15, 0.95) * drive;
	} else if (kind === 'crown') {
		radius = site.edge * between(rng, 0.4, 1.5);
		z = spell.reach * between(rng, 1.0, 1.7);
		rise = spell.speed * drive * between(rng, 0.28, 0.66);
		outward = between(rng, 0.05, 0.5);
	} else if (punch > 0.1) {
		// The punch throws marks out low and fast, and they are gone by the body.
		// Not far out, though: a crowd of marks fleeing the axis is a starburst.
		radius = spell.footprint * between(rng, 0.15, 1.2);
		z = between(rng, 0.01, 0.7);
		rise = spell.speed * drive * between(rng, 1.1, 2.6);
		outward = between(rng, 0.1, 0.8);
	}

	// A tongue is measured against the foot it pools on, not against a boundary it
	// never touched.
	const edge = kind === 'tongue' ? spell.footprint * 1.2 : Math.max(site.edge, 1e-3);
	// A lick is the hot tongue torn off the edge, so it reads a little above the
	// pigment behind it; smoke reads a long way below.
	const lift = kind === 'lick' ? 0.26 : kind === 'crown' ? -0.34 : 0.04;
	const raw = localHeat(spell, radius, z, edge) + lift;
	// Non-core marks are held below the white band: the warm near-white belongs to
	// the fluid's hottest sliver, and a lick that reaches it stops being pigment.
	const heat = Math.max(0, Math.min(MASS_CEILING, raw - soot * (kind === 'crown' ? 0.55 : 0.4)));

	mark.alive = true;
	mark.kind = kind;
	mark.x = cos * radius;
	mark.y = sin * radius;
	mark.z = z;
	mark.vx = cos * outward;
	mark.vy = sin * outward;
	mark.vz = rise;
	mark.ax = 0;
	mark.ay = 0;
	mark.az = 0;
	mark.ageMs = 0;
	mark.lifeMs =
		between(rng, recipe.life[0], recipe.life[1]) * (kind === 'lick' ? 1 - 0.3 * punch : 1);
	// The harder the mass was tearing where this mark was born, the bigger the mark
	// the tear draws: a shoulder shedding hard gets a tongue a viewer can read, and
	// a quiet stretch of edge gets a hair.
	const torn = kind === 'lick' ? Math.min(1, Math.max(0, site.tear / LICK.tearBar - 1)) : 0;
	mark.size =
		between(rng, recipe.size[0], recipe.size[1]) *
		(1 + 0.4 * punch) *
		(1 + 0.85 * torn) *
		(kind === 'lick' ? 0.68 + 0.5 * Math.min(1, z / spell.reach) : 1);
	mark.squash = between(rng, 0.85, 1.45);
	// The punch is a smear, not a bouquet: it lays streaks and washes where the
	// body would lay tongues.
	mark.slot =
		kind === 'lick' && punch > 0.1
			? pick(rng, [BRUSH_SLOT.streak, BRUSH_SLOT.streak, BRUSH_SLOT.wash, BRUSH_SLOT.lick])
			: pick(rng, recipe.slots);
	// Licks and streaks carry their own direction, so they may only be mirrored
	// across the spine. Flipping them end for end would point the tongue backwards
	// down its own travel, which is what makes a crowd of them read as spikes.
	const directional = mark.slot === BRUSH_SLOT.lick || mark.slot === BRUSH_SLOT.streak;
	mark.flip = directional ? (rng() < 0.5 ? 0 : 2) : Math.floor(rng() * 4);
	mark.angle = rng() * Math.PI * 2;
	mark.lean = bunched(rng) * 0.72;
	mark.spin = between(rng, -1.4, 1.4) * (mark.slot === BRUSH_SLOT.wash ? 1 : 0.26);
	mark.inertia = between(rng, LICK.inertiaLow, LICK.inertiaHigh);
	mark.peak =
		between(rng, LICK.peakLow, LICK.peakHigh) * (kind === 'crown' ? 0.46 : 1) * (1 + 0.5 * torn);
	mark.growth = between(rng, 0.3, 0.95);
	mark.heat = heat;
	mark.phase = rng() * Math.PI * 2;
	mark.flickerRate = between(rng, 6, 21);
}

/** A dead mark, so the pool can be sized once and never allocate again. */
export function blankMark(): Mark {
	return {
		alive: false,
		kind: 'lick',
		x: 0,
		y: 0,
		z: 0,
		vx: 0,
		vy: 0,
		vz: 0,
		ax: 0,
		ay: 0,
		az: 0,
		ageMs: 0,
		lifeMs: 1,
		size: 0.3,
		squash: 1,
		slot: BRUSH_SLOT.lick,
		flip: 0,
		angle: 0,
		lean: 0,
		spin: 0,
		inertia: 4,
		peak: 0.3,
		growth: 0.5,
		heat: 0.6,
		phase: 0,
		flickerRate: 10
	};
}
