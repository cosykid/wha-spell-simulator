/**
 * @file Where a brush mark is born, and what it is made of.
 *
 * The marks are accents drawn *on* the parcel mass, so a mark may not be placed
 * anywhere the mass is not. Every birth site is found on the mass's own
 * wandering boundary — the surface the field pinches its parcels toward — and
 * among a handful of candidates the one that is tearing hardest wins:
 * turbulence pushing outward through the edge, a boundary already bulged into a
 * shoulder, and a place on screen where the silhouette actually reads.
 *
 * One search serves every archetype, because every archetype pinches toward the
 * same parameterised boundary. A column's is a narrowing cone, a whirl's a
 * flaring funnel, a fan's a low ring; the search does not know which.
 */

import type { FlowShape } from './flow.js';
import type { BirthSite } from './tear.js';
import { BRUSH_SLOT, type BrushSlot } from './brushSlot.js';
import { MARK } from './tuning.js';
import type { Rng } from '../rng.js';

/**
 * What a mark is. Four kinds, and the fourth is the manga's own black: a small
 * population of dark outline strokes riding the leading edges, which is what a
 * mass of warm pigment cannot supply for itself.
 */
export type MarkKind = 'lick' | 'tongue' | 'crown' | 'ink';

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
		size: [MARK.sizeLow, MARK.sizeHigh],
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
	},
	ink: {
		// Short and small: an outline is a decision, and a decision that lingers
		// becomes a shape. It reads for a beat and the mass moves on past it.
		life: [220, 520],
		size: [0.1, 0.26],
		slots: [BRUSH_SLOT.streak, BRUSH_SLOT.streak, BRUSH_SLOT.lick]
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

/** How hot the mass is here: young and near the axis low down, cooling up and out. */
function localHeat(shape: FlowShape, radius: number, along: number, edge: number): number {
	const climb = smoothstep(0, shape.reach * 1.3, along);
	const off = Math.min(1, radius / Math.max(edge, 1e-3));
	return Math.max(0, 0.99 - 0.6 * climb - 0.2 * off);
}

/** What the arc is asking of a birth: how hard it is driven and how cooled. */
export interface BirthArc {
	drive: number;
	punch: number;
	soot: number;
	/** Multiplier on peak alpha, from the row's material profile. */
	alpha: number;
	/** Multiplier on mark size, from the row's material profile. */
	size: number;
	/** How far up the ramp a mark may climb. */
	ceiling: number;
	/** Multiplier on how long a mark lives. A shock's marks are over with it. */
	life: number;
}

/** Fills `mark` with a fresh birth of `kind` at `site`. */
export function birth(
	mark: Mark,
	rng: Rng,
	shape: FlowShape,
	kind: MarkKind,
	site: BirthSite,
	arc: BirthArc
): void {
	const recipe = RECIPE[kind];
	const cos = Math.cos(site.angle);
	const sin = Math.sin(site.angle);
	let radius = site.edge * between(rng, MARK.insetLow, MARK.insetHigh);
	let along = site.along;
	let rise = shape.speed * arc.drive * between(rng, 0.7, 1.25);
	let outward = between(rng, -0.12, 0.3) * arc.drive;

	if (kind === 'tongue') {
		// Down at the foot a tongue has nowhere to point, so it is laid flat: a
		// wash pooling outward, which is what stops a foot being specks.
		radius = shape.footprint * between(rng, 0.1, 1.05);
		along = between(rng, 0, 0.22) * shape.reach;
		rise = shape.speed * arc.drive * between(rng, 0.2, 0.7);
		outward = between(rng, 0.15, 0.95) * arc.drive;
	} else if (kind === 'crown') {
		radius = site.edge * between(rng, 0.4, 1.5);
		along = shape.reach * between(rng, 1.0, 1.7);
		rise = shape.speed * arc.drive * between(rng, 0.28, 0.66);
		outward = between(rng, 0.05, 0.5);
	} else if (kind === 'ink') {
		// An outline sits *on* the silhouette rather than inside it, and it runs
		// with the edge instead of tearing off it.
		radius = site.edge * between(rng, 0.94, 1.12);
		rise = shape.speed * arc.drive * between(rng, 0.5, 0.95);
		outward = between(rng, -0.05, 0.18) * arc.drive;
	} else if (arc.punch > 0.1) {
		// The punch throws marks out low and fast, and they are gone by the body.
		// Not far out, though: a crowd of marks fleeing the axis is a starburst.
		radius = shape.footprint * between(rng, 0.15, 1.2);
		along = between(rng, 0.01, 0.7) * shape.reach;
		rise = shape.speed * arc.drive * between(rng, 1.1, 2.6);
		outward = between(rng, 0.1, 0.8);
	}

	// A tongue is measured against the foot it pools on, not against a boundary
	// it never touched.
	const edge = kind === 'tongue' ? shape.footprint * 1.2 : Math.max(site.edge, 1e-3);
	// A lick is the hot tongue torn off the edge, so it reads a little above the
	// pigment behind it; smoke reads a long way below.
	const lift = kind === 'lick' ? 0.26 : kind === 'crown' ? -0.34 : 0.04;
	const raw = localHeat(shape, radius, along, edge) + lift;
	const cooled = raw - arc.soot * (kind === 'crown' ? 0.55 : 0.4);
	// Ink is not on the heat axis at all: the pool paints it from the palette's
	// own black, so its heat is only a flag the collector reads.
	const heat = kind === 'ink' ? 0 : Math.max(0, Math.min(arc.ceiling, cooled)) * shape.heat;

	mark.alive = true;
	mark.kind = kind;
	mark.x = shape.originX + cos * radius + shape.axisX * along;
	mark.y = shape.originY + sin * radius + shape.axisY * along;
	mark.z = Math.max(0, shape.originZ + shape.axisZ * along);
	mark.vx = cos * outward;
	mark.vy = sin * outward;
	mark.vz = rise * shape.axisZ + shape.axisX * rise * 0.3;
	mark.ax = 0;
	mark.ay = 0;
	mark.az = 0;
	mark.ageMs = 0;
	mark.lifeMs =
		between(rng, recipe.life[0], recipe.life[1]) *
		arc.life *
		(kind === 'lick' ? 1 - 0.3 * arc.punch : 1);
	// The harder the mass was tearing where this mark was born, the bigger the
	// mark the tear draws: a shoulder shedding hard gets a tongue a viewer can
	// read, and a quiet stretch of edge gets a hair.
	const torn = kind === 'lick' ? Math.min(1, Math.max(0, site.tear / MARK.tearBar - 1)) : 0;
	mark.size =
		between(rng, recipe.size[0], recipe.size[1]) *
		arc.size *
		(1 + 0.4 * arc.punch) *
		(1 + 0.85 * torn) *
		(kind === 'lick' ? 0.68 + 0.5 * Math.min(1, along / Math.max(shape.reach, 1e-3)) : 1);
	mark.squash = kind === 'ink' ? between(rng, 0.16, 0.34) : between(rng, 0.85, 1.45);
	// The punch is a smear, not a bouquet: it lays streaks and washes where the
	// body would lay tongues.
	mark.slot =
		kind === 'lick' && arc.punch > 0.1
			? pick(rng, [BRUSH_SLOT.streak, BRUSH_SLOT.streak, BRUSH_SLOT.wash, BRUSH_SLOT.lick])
			: pick(rng, recipe.slots);
	// Licks and streaks carry their own direction, so they may only be mirrored
	// across the spine. Flipping them end for end would point the tongue backwards
	// down its own travel, which is what makes a crowd of them read as spikes.
	const directional = mark.slot === BRUSH_SLOT.lick || mark.slot === BRUSH_SLOT.streak;
	mark.flip = directional ? (rng() < 0.5 ? 0 : 2) : Math.floor(rng() * 4);
	mark.angle = rng() * Math.PI * 2;
	// An outline lies *across* its own travel, so it reads as a contour on the
	// silhouette. Left to chase the flow like every other mark it would point
	// straight out of the mass, and a crowd of those is a starburst of blades.
	mark.lean = kind === 'ink' ? Math.PI / 2 + bunched(rng) * 0.42 : bunched(rng) * 0.72;
	mark.spin = between(rng, -1.4, 1.4) * (mark.slot === BRUSH_SLOT.wash ? 1 : 0.26);
	mark.inertia = between(rng, MARK.inertiaLow, MARK.inertiaHigh);
	mark.peak =
		between(rng, MARK.peakLow, MARK.peakHigh) *
		arc.alpha *
		(kind === 'crown' ? 0.46 : kind === 'ink' ? 2.1 : 1) *
		(1 + 0.5 * torn);
	mark.growth = between(rng, 0.3, 0.95);
	mark.heat = heat;
	mark.phase = rng() * Math.PI * 2;
	mark.flickerRate = between(rng, 6, 21);
}

/** A dead mark, so a pool is sized once and never allocates again. */
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
